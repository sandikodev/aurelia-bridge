/**
 * @aureliajs/bridge - Native Aurelia 2 `<au-bridge>` Custom Element
 *
 * Mounts foreign UI framework component subtrees (React, Vue, Svelte, SolidJS,
 * Preact, Qwik, or custom adapters) inside Aurelia 2 with live reactive props,
 * lazy `() => import(...)` component loaders, and deterministic DI teardown.
 *
 * Composes orthogonally with `@aureliajs/islands`:
 * ```html
 * <au-bridge island="visible" using="react" component.bind="loadChart" props.bind="data"></au-bridge>
 * ```
 */

import { INode, IPlatform, optional, resolve } from 'aurelia';
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

export class AuBridge {
  public static readonly $au: {
    readonly type: 'custom-element';
    readonly name: string;
    readonly template: string;
    readonly bindables: readonly string[];
  } = {
    type: 'custom-element',
    name: 'au-bridge',
    template: `<div ref="mountPoint" data-bridge-framework.bind="getEffectiveFramework()"></div>`,
    bindables: ['using', 'type', 'component', 'loader', 'props', 'value', 'onChange', 'onUpdate', 'onEvent'],
  };

  public using: BridgeFramework = 'react';
  public type?: BridgeFramework;
  public component: BridgeComponentInput = null;
  public loader?: () => Promise<unknown>;
  public props: Record<string, unknown> = {};
  public value?: unknown;
  public onChange?: (val: unknown) => void;
  public onEvent?: BridgeEventHandler;
  public onUpdate?: BridgeEventHandler;
  public mountPoint?: HTMLElement;

  private readonly host = resolve(INode) as HTMLElement;
  private readonly platform = resolve(IPlatform);
  private readonly ssrContext = resolve(optional(ISSRContext));
  private readonly registry: IBridgeRegistry =
    resolve(optional(IBridgeRegistry)) ?? createDefaultBridgeRegistry();
  private instance: BridgeInstance | null = null;
  private isAttached = false;
  private mountEpoch = 0;

  public getEffectiveFramework(): BridgeFramework {
    return this.type ?? this.using ?? 'react';
  }

  private getEffectiveProps(): Record<string, unknown> {
    return {
      ...(this.props),
      ...(this.value !== undefined ? { value: this.value } : {}),
    };
  }

  async attached(): Promise<void> {
    this.isAttached = true;
    // SSR Safe Guard: In server-side rendering, skip client mounting of foreign runtimes
    if (this.ssrContext) {
      return;
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

  async loaderChanged(): Promise<void> {
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

  async typeChanged(newType: BridgeFramework): Promise<void> {
    if (newType) {
      this.using = newType;
    }
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
    if (!container || (!this.component && !this.loader)) return;

    const epoch = ++this.mountEpoch;

    try {
      let rawLoaded: unknown = null;
      if (typeof this.loader === 'function') {
        rawLoaded = await this.loader();
      } else if (typeof this.component === 'function' && this.component.length === 0) {
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
      const fw = this.getEffectiveFramework();
      let effectiveAdapter = this.registry.get(fw);

      if (rawLoaded && typeof rawLoaded === 'object') {
        const asObj = rawLoaded as Record<string, unknown>;
        if (asObj.adapter && typeof (asObj.adapter as BridgeAdapter).mount === 'function') {
          effectiveAdapter = asObj.adapter as BridgeAdapter;
        }
        resolvedComponent = asObj.component ?? asObj.default ?? rawLoaded;
      }

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

/**
 * Universal Convention Island (<aurelia-island>)
 * Backward-compatible alias for <au-bridge> allowing:
 * <aurelia-island type="react" component.bind="ReactCounter" value.bind="count" on-change.bind="sync">
 */
export class AureliaIsland extends AuBridge {
  public static override readonly $au = {
    type: 'custom-element' as const,
    name: 'aurelia-island',
    template: `<div ref="mountPoint" data-bridge-framework.bind="getEffectiveFramework()"></div>`,
    bindables: ['type', 'using', 'component', 'loader', 'props', 'value', 'onChange', 'onUpdate', 'onEvent'] as const,
  };
}
