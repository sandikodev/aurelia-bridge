/**
 * @aureliajs/bridge - Native Aurelia 2 `au-htmx` Custom Attribute
 *
 * Idiomatic Aurelia Custom Attribute for enhancing existing DOM elements with HTMX
 * hypermedia attributes (`hx-get`, `hx-post`, `hx-swap`, `hx-trigger`) without adding
 * extra wrapper nodes or forcing hypermedia into JS props contracts.
 *
 * ```html
 * <section au-htmx hx-get="/partials/stats" hx-trigger="load"></section>
 * ```
 */

import { INode, IPlatform, optional, resolve } from 'aurelia';
import { IHtmx, type HtmxLike } from './types.js';

export class AuHtmx {
  public static readonly $au = {
    type: 'custom-attribute',
    name: 'au-htmx',
    bindables: ['value'],
    defaultProperty: 'value',
  } as const;

  public value?: HtmxLike | boolean;

  private readonly element = resolve(INode) as Element;
  private readonly platform = resolve(IPlatform);
  private readonly injectedHtmx = resolve(optional(IHtmx));
  private isAttached = false;

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
  }

  detaching(): void {
    this.isAttached = false;
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
