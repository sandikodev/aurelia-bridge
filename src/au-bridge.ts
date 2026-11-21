/**
 * @aureliajs/bridge - Native Aurelia 2 `<au-bridge>` & Framework Elements
 *
 * Mounts foreign UI framework component subtrees (React, Vue, Svelte, SolidJS,
 * Preact, Qwik, Lit) inside Aurelia 2 with:
 * - Two-way reactive `value.bind` by default (zero boilerplate synchronization)
 * - Automatic framework detection from component signatures/metadata
 * - Dedicated convention Custom Elements: <au-react>, <au-vue>, <au-svelte>, etc.
 * - Single unified `component.bind` (supports eager classes or async loaders)
 * - Deterministic DI teardown and monotonic race-safe mounting (mountEpoch)
 */

import { BindingMode, INode, IPlatform, optional, resolve } from 'aurelia';
import { ISSRContext } from '@aurelia/runtime-html';
import {
  IBridgeRegistry,
  type BridgeAdapter,
  type BridgeComponentInput,
  type BridgeEventHandler,
  type BridgeFramework,
  type BridgeInstance,
} from './types.js';
import { createDefaultBridgeRegistry } from './adapters/index.js';

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Automatically detect the foreign framework from component metadata, prototype, or file signature.
 */
export function detectFramework(component: unknown): BridgeFramework {
  if (!component) return 'react';

  // 1. Lit / Web Components: subclass of HTMLElement or custom element tag
  if (
    (typeof component === 'function' &&
      component.prototype &&
      (component.prototype instanceof (globalThis.HTMLElement || Object) ||
        typeof (component.prototype as { connectedCallback?: unknown }).connectedCallback === 'function')) ||
    (typeof component === 'string' && component.includes('-'))
  ) {
    return 'lit';
  }

  // 2. Vue 3: __vccOpts, __file ending with .vue, or setup/render signature
  const compObj = component as Record<string, unknown>;
  if (
    '__vccOpts' in compObj ||
    (typeof compObj.__file === 'string' && compObj.__file.endsWith('.vue')) ||
    ('setup' in compObj && typeof compObj.setup === 'function')
  ) {
    return 'vue';
  }

  // 3. Svelte 5 / Svelte 4: Svelte component markers or .svelte file
  if (
    '$$render' in compObj ||
    ('render' in compObj && '$$' in compObj) ||
    (typeof compObj.__file === 'string' && compObj.__file.endsWith('.svelte'))
  ) {
    return 'svelte';
  }

  // 4. Qwik: component$ QRL markers or qRuntimeQrl
  if (
    'qrl' in compObj ||
    '__qwik_component__' in compObj ||
    (typeof component === 'function' && (component as { qRuntimeQrl?: boolean }).qRuntimeQrl)
  ) {
    return 'qwik';
  }

  // 5. Default fallback
  return 'react';
}

export class AuBridge {
  public static readonly $au = {
    type: 'custom-element' as const,
    name: 'au-bridge',
    template: `<div ref="mountPoint" data-bridge-framework.bind="getEffectiveFramework()"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'using',
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public using?: BridgeFramework;
  public component: BridgeComponentInput = null;
  public props: Record<string, unknown> = {};
  public value?: unknown;
  public onChange?: (val: unknown) => void;
  public onEvent?: BridgeEventHandler;
  public onUpdate?: BridgeEventHandler;
  public onError?: (err: unknown) => void;
  public mountPoint?: HTMLElement;

  private readonly host = resolve(INode) as HTMLElement;
  private readonly platform = resolve(IPlatform);
  private readonly ssrContext = resolve(optional(ISSRContext));
  private readonly registry: IBridgeRegistry =
    resolve(optional(IBridgeRegistry)) ?? createDefaultBridgeRegistry();
  private instance: BridgeInstance | null = null;
  private isAttached = false;
  private mountEpoch = 0;
  private resolvedComponent: unknown = null;

  public getEffectiveFramework(): BridgeFramework {
    if (this.using) return this.using;
    return detectFramework(this.resolvedComponent ?? this.component);
  }

  private getEffectiveProps(): Record<string, unknown> {
    return {
      ...this.props,
      ...(this.value !== undefined ? { value: this.value } : {}),
    };
  }

  async attached(): Promise<void> {
    this.isAttached = true;
    // SSR Safe Guard: In server-side rendering, skip client mounting of foreign runtimes
    if (this.ssrContext) {
      return;
    }

    // Diagnostic hint: If developer specified island="..." but @aureliajs/islands is not registered,
    // Aurelia's compiler treats it as a standard HTML attribute instead of a Template Controller.
    if (this.host.hasAttribute('island')) {
      const trigger = this.host.getAttribute('island');
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.info(
          `[@aureliajs/bridge] Note: Element <${this.host.tagName.toLowerCase()}> has island="${trigger}", but @aureliajs/islands is not registered in this DI container. Register IslandsConfiguration from '@aureliajs/islands' to enable selective hydration scheduling.`
        );
      }
    }

    await this.mountBridge();
  }

  propsChanged(_newProps: Record<string, unknown>): void {
    if (this.ssrContext) return;
    if (this.instance) {
      void this.instance.update(this.getEffectiveProps());
    }
  }

  valueChanged(_newValue: unknown): void {
    if (this.ssrContext) return;
    if (this.instance) {
      void this.instance.update(this.getEffectiveProps());
    }
  }

  async componentChanged(): Promise<void> {
    if (this.ssrContext) return;
    if (this.isAttached) {
      await this.remountBridge();
    }
  }

  async usingChanged(): Promise<void> {
    if (this.isAttached) {
      await this.remountBridge();
    }
  }

  onUpdateChanged(handler: BridgeEventHandler): void {
    if (handler && !this.onEvent) {
      this.onEvent = handler;
    }
  }

  async detaching(): Promise<void> {
    this.isAttached = false;
    this.mountEpoch++;
    await this.unmountBridge();
  }

  private async remountBridge(): Promise<void> {
    await this.unmountBridge();
    await this.mountBridge();
  }

  private async mountBridge(): Promise<void> {
    const container = this.mountPoint ?? this.host;
    if (!container || !this.component) return;

    const epoch = ++this.mountEpoch;

    try {
      let rawLoaded: unknown = null;
      if (typeof this.component === 'function' && this.component.length === 0) {
        try {
          const res = (this.component as () => unknown)();
          if (isPromiseLike(res)) {
            rawLoaded = await res;
          } else {
            rawLoaded = res;
          }
        } catch {
          rawLoaded = this.component;
        }
      } else if (isPromiseLike(this.component)) {
        rawLoaded = await this.component;
      } else {
        rawLoaded = this.component;
      }

      let resolvedComponent: unknown = rawLoaded;
      let effectiveAdapter: BridgeAdapter | undefined;

      if (rawLoaded && typeof rawLoaded === 'object') {
        const asObj = rawLoaded as Record<string, unknown>;
        if (asObj.adapter && typeof (asObj.adapter as BridgeAdapter).mount === 'function') {
          effectiveAdapter = asObj.adapter as BridgeAdapter;
        }
        resolvedComponent = asObj.component ?? asObj.default ?? rawLoaded;
      }

      this.resolvedComponent = resolvedComponent;
      const fw = this.getEffectiveFramework();
      effectiveAdapter ??= this.registry.get(fw);

      if (!effectiveAdapter) {
        console.warn(`[@aureliajs/bridge] No adapter registered for framework: "${fw}".`);
        return;
      }

      // Abort if unmounted or remounted while async loader was in flight
      if (!this.isAttached || epoch !== this.mountEpoch || !resolvedComponent) {
        return;
      }

      const mounted = await effectiveAdapter.mount({
        container,
        component: resolvedComponent,
        props: this.getEffectiveProps(),
        onEvent: (event: string, payload?: unknown) => {
          if (event === 'change') {
            this.value = payload;
            this.onChange?.(payload);
          }
          this.onEvent?.(event, payload);
          this.onUpdate?.(event, payload);
          const EventCtor = this.platform.CustomEvent;
          if (EventCtor && typeof this.host.dispatchEvent === 'function') {
            this.host.dispatchEvent(
              new EventCtor('bridge-event', {
                bubbles: true,
                composed: true,
                detail: { framework: fw, event, payload },
              })
            );
          }
        },
      });

      if (!this.isAttached || epoch !== this.mountEpoch) {
        await mounted.destroy();
        return;
      }

      this.instance = mounted;
    } catch (err) {
      this.onError?.(err);
      const EventCtor = this.platform.CustomEvent;
      if (EventCtor && typeof this.host.dispatchEvent === 'function') {
        this.host.dispatchEvent(
          new EventCtor('bridge-error', {
            bubbles: true,
            composed: true,
            detail: { framework: this.getEffectiveFramework(), error: err },
          })
        );
      }
      console.error(`[@aureliajs/bridge] Error mounting "${this.getEffectiveFramework()}" component:`, err);
    }
  }

  private async unmountBridge(): Promise<void> {
    if (this.instance) {
      const current = this.instance;
      this.instance = null;
      await current.destroy();
    }
  }
}

/** Dedicated Convention Custom Element: <au-react> */
export class AuReact extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-react',
    template: `<div ref="mountPoint" data-bridge-framework="react"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'react';
}

/** Dedicated Convention Custom Element: <au-vue> */
export class AuVue extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-vue',
    template: `<div ref="mountPoint" data-bridge-framework="vue"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'vue';
}

/** Dedicated Convention Custom Element: <au-svelte> */
export class AuSvelte extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-svelte',
    template: `<div ref="mountPoint" data-bridge-framework="svelte"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'svelte';
}

/** Dedicated Convention Custom Element: <au-solid> */
export class AuSolid extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-solid',
    template: `<div ref="mountPoint" data-bridge-framework="solid"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'solid';
}

/** Dedicated Convention Custom Element: <au-preact> */
export class AuPreact extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-preact',
    template: `<div ref="mountPoint" data-bridge-framework="preact"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'preact';
}

/** Dedicated Convention Custom Element: <au-qwik> */
export class AuQwik extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-qwik',
    template: `<div ref="mountPoint" data-bridge-framework="qwik"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'qwik';
}

/** Dedicated Convention Custom Element: <au-lit> */
export class AuLit extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'au-lit',
    template: `<div ref="mountPoint" data-bridge-framework="lit"></div>`,
    bindables: [
      { name: 'value', mode: BindingMode.twoWay },
      'component',
      'props',
      'onChange',
      'onUpdate',
      'onEvent',
      'onError',
    ],
  };

  public override using: BridgeFramework = 'lit';
}
