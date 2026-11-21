/**
 * @aureliajs/bridge - Native Aurelia 2 `au-htmx` Custom Attribute
 *
 * Idiomatic Aurelia Custom Attribute for enhancing existing DOM elements with HTMX
 * hypermedia attributes (`hx-get`, `hx-post`, `hx-swap`, `hx-trigger`) without adding
 * extra wrapper nodes.
 *
 * Automatically enhances Aurelia custom elements inside swapped hypermedia fragments.
 */

import { Aurelia, IContainer, INode, IPlatform, optional, resolve } from 'aurelia';
import { IHtmx, type HtmxLike } from './types.js';

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

    const htmx = await this.resolveHtmx();
    if (!this.isAttached) return;

    if (!htmx) {
      console.warn(
        '[@aureliajs/bridge] `au-htmx` could not find an HTMX runtime. Pass via BridgeConfiguration.customize({ htmx }), global `window.htmx`, or install `htmx.org`.'
      );
      return;
    }

    // Default CSP safety: disable eval in HTMX expressions unless explicitly overridden by host app
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

  private async resolveHtmx(): Promise<HtmxLike | null> {
    if (this.value && typeof this.value === 'object' && typeof this.value.process === 'function') {
      return this.value;
    }

    if (this.injectedHtmx) {
      return this.injectedHtmx;
    }

    const winHtmx = (this.platform.window as unknown as { htmx?: HtmxLike })?.htmx;
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
      // Optional peer dependency not installed
    }

    return null;
  }
}
