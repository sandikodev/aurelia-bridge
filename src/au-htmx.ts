/**
 * @aureliajs/bridge - Native Aurelia 2 HTMX Hypermedia Integration
 *
 * Provides two clean, idiomatic integration styles for HTMX in Aurelia 2:
 * 1. `au-htmx` Custom Attribute: Enhances any native HTML element (<section au-htmx hx-get="/api">).
 * 2. `<au-htmx>` Custom Element: Declarative container for hypermedia regions.
 *
 * Both automatically enhance newly swapped HTML fragments with Aurelia's DI container!
 */

import { Aurelia, IContainer, INode, IPlatform, optional, resolve } from 'aurelia';
import { IHtmx, type HtmxLike } from './types.js';

export async function resolveHtmxRuntime(
  value: unknown,
  injected: HtmxLike | null | undefined,
  platform: IPlatform
): Promise<HtmxLike | null> {
  if (value && typeof value === 'object' && typeof (value as HtmxLike).process === 'function') {
    return value as HtmxLike;
  }
  if (injected) {
    return injected;
  }
  const winHtmx = (platform.window as unknown as { htmx?: HtmxLike })?.htmx;
  if (winHtmx && typeof winHtmx.process === 'function') {
    return winHtmx;
  }
  try {
    const mod = (await import('htmx.org')) as { default?: HtmxLike } & Partial<HtmxLike>;
    const resolved = mod.default ?? mod;
    if (resolved && typeof resolved.process === 'function') {
      return resolved as HtmxLike;
    }
  } catch {
    // Optional peer dependency
  }
  return null;
}

/**
 * Idiomatic Custom Attribute for enhancing existing DOM elements with HTMX.
 * Usage: <section au-htmx hx-get="/api/feed" hx-trigger="revealed"></section>
 */
export class AuHtmx {
  public static readonly $au = {
    type: 'custom-attribute' as const,
    name: 'au-htmx',
    bindables: ['value', 'enhance'],
    defaultProperty: 'value',
  };

  public value?: HtmxLike | boolean;
  public enhance = true;

  private readonly element = resolve(INode) as HTMLElement;
  private readonly platform = resolve(IPlatform);
  private readonly container = resolve(IContainer);
  private readonly injectedHtmx = resolve(optional(IHtmx));
  private isAttached = false;
  private swapListener?: (evt: Event) => void;

  async attached(): Promise<void> {
    this.isAttached = true;
    if (this.value === false) return;

    const htmx = await resolveHtmxRuntime(this.value, this.injectedHtmx, this.platform);
    if (!this.isAttached) return;

    if (!htmx) {
      console.warn(
        '[@aureliajs/bridge] `au-htmx` could not find an HTMX runtime. Pass via BridgeConfiguration.customize({ htmx }), global `window.htmx`, or install `htmx.org`.'
      );
      return;
    }

    if (htmx.config && typeof htmx.config === 'object' && htmx.config.allowEval === undefined) {
      htmx.config.allowEval = false;
    }

    htmx.process(this.element);

    if (this.enhance) {
      this.swapListener = (evt: Event) => {
        const target = (evt as unknown as { detail?: { target?: HTMLElement } }).detail?.target ?? this.element;
        if (target && typeof target.querySelectorAll === 'function') {
          try {
            const au = new Aurelia(this.container);
            void au.enhance({ host: target, component: {} });
          } catch {
            // Ignore if no aurelia custom elements present
          }
        }
      };
      this.element.addEventListener('htmx:afterSwap', this.swapListener);
    }
  }

  detaching(): void {
    this.isAttached = false;
    if (this.swapListener) {
      this.element.removeEventListener('htmx:afterSwap', this.swapListener);
      this.swapListener = undefined;
    }
  }
}

/**
 * Declarative Custom Element for hypermedia regions.
 * Usage:
 * <au-htmx from="/api/stats" trigger="load" swap="innerHTML"></au-htmx>
 * or:
 * <au-htmx>
 *   <button hx-get="/api/feed" hx-target="#feed">Load</button>
 *   <div id="feed"></div>
 * </au-htmx>
 */
export class AuHtmxElement {
  public static readonly $au = {
    type: 'custom-element' as const,
    name: 'au-htmx',
    template: `<div ref="container" class="au-htmx-container"><slot></slot></div>`,
    bindables: ['from', 'trigger', 'swap', 'target', 'enhance'],
  };

  public from?: string;
  public trigger?: string;
  public swap?: string;
  public target?: string;
  public enhance = true;

  public container!: HTMLElement;
  private readonly platform = resolve(IPlatform);
  private readonly appContainer = resolve(IContainer);
  private readonly injectedHtmx = resolve(optional(IHtmx));
  private isAttached = false;
  private swapListener?: (evt: Event) => void;

  async attached(): Promise<void> {
    this.isAttached = true;
    const targetEl = this.container;

    if (this.from) {
      targetEl.setAttribute('hx-get', this.from);
      if (this.trigger) targetEl.setAttribute('hx-trigger', this.trigger);
      if (this.swap) targetEl.setAttribute('hx-swap', this.swap);
      if (this.target) targetEl.setAttribute('hx-target', this.target);
    }

    const htmx = await resolveHtmxRuntime(null, this.injectedHtmx, this.platform);
    if (!this.isAttached || !htmx) return;

    if (htmx.config && typeof htmx.config === 'object' && htmx.config.allowEval === undefined) {
      htmx.config.allowEval = false;
    }

    htmx.process(targetEl);

    if (this.enhance) {
      this.swapListener = (evt: Event) => {
        const swapped = (evt as unknown as { detail?: { target?: HTMLElement } }).detail?.target ?? targetEl;
        if (swapped && typeof swapped.querySelectorAll === 'function') {
          try {
            const au = new Aurelia(this.appContainer);
            void au.enhance({ host: swapped, component: {} });
          } catch {
            // Ignore if no aurelia custom elements present
          }
        }
      };
      targetEl.addEventListener('htmx:afterSwap', this.swapListener);
    }
  }

  detaching(): void {
    this.isAttached = false;
    if (this.swapListener && this.container) {
      this.container.removeEventListener('htmx:afterSwap', this.swapListener);
      this.swapListener = undefined;
    }
  }
}
