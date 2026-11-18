/**
 * @aureliajs/bridge - Pure Generic Type Definitions & DI Tokens
 * Maintained by Sandikodev (https://github.com/sandikodev)
 */

import { DI, type IResolver } from 'aurelia';

export type BridgeFramework =
  | 'react'
  | 'vue'
  | 'svelte'
  | 'solid'
  | 'preact'
  | 'qwik'
  | 'lit'
  | (string & {});

/**
 * Generic event dispatcher bridging foreign framework subtrees back into Aurelia 2.
 */
export type BridgeEventHandler = (event: string, payload?: unknown) => void;

/**
 * Either an eager foreign component or a lazy dynamic import factory (`() => import('./Chart.tsx')`).
 */
export type BridgeComponentLoader<TComponent = unknown> = () => Promise<
  TComponent | { readonly default: TComponent }
>;

export type BridgeComponentInput<TComponent = unknown> =
  | TComponent
  | BridgeComponentLoader<TComponent>;

/**
 * Context passed to a `BridgeAdapter.mount()` implementation.
 */
export interface BridgeMountContext<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TComponent = unknown,
> {
  readonly container: HTMLElement;
  readonly component: TComponent;
  readonly props: TProps;
  readonly onEvent?: BridgeEventHandler;
}

/**
 * Active mounted foreign component handle returned by a `BridgeAdapter`.
 */
export interface BridgeInstance<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TNative = unknown,
> {
  update(props: Partial<TProps>): void | Promise<void>;
  destroy(): void | Promise<void>;
  readonly nativeInstance?: TNative;
}

/**
 * Framework-agnostic adapter contract for mounting foreign UI component subtrees
 * inside an Aurelia 2 `<au-bridge>` host element.
 */
export interface BridgeAdapter<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TComponent = unknown,
  TNative = unknown,
> {
  readonly framework: BridgeFramework;
  mount(
    context: BridgeMountContext<TProps, TComponent>
  ): Promise<BridgeInstance<TProps, TNative>> | BridgeInstance<TProps, TNative>;
}

/**
 * Zero-overhead identity helper preserving full generic type inference
 * when authoring custom `BridgeAdapter` implementations.
 */
export function defineBridgeAdapter<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TComponent = unknown,
  TNative = unknown,
>(
  adapter: BridgeAdapter<TProps, TComponent, TNative>
): BridgeAdapter<TProps, TComponent, TNative> {
  return adapter;
}

/**
 * Container-scoped registry of foreign framework bridge adapters.
 */
export interface IBridgeRegistry {
  register(adapter: BridgeAdapter): this;
  get(framework: BridgeFramework): BridgeAdapter | undefined;
  has(framework: BridgeFramework): boolean;
  list(): BridgeFramework[];
}

/**
 * Aurelia 2 DI token for container-scoped `IBridgeRegistry`.
 */
export const IBridgeRegistry: IResolver<IBridgeRegistry> =
  /*@__PURE__*/ DI.createInterface<IBridgeRegistry>(
    'IBridgeRegistry'
  ) as unknown as IResolver<IBridgeRegistry>;

/**
 * Structural contract for HTMX runtime used by the native `au-htmx` Custom Attribute.
 */
export interface HtmxLike {
  process(elt: Element): void;
  trigger?(elt: Element, eventName: string, detail?: Record<string, unknown>): boolean;
  config?: Record<string, unknown>;
}

/**
 * Optional Aurelia 2 DI token to inject a custom/bundled HTMX instance into `au-htmx`.
 */
export const IHtmx: IResolver<HtmxLike> =
  /*@__PURE__*/ DI.createInterface<HtmxLike>('IHtmx') as unknown as IResolver<HtmxLike>;

/**
 * Configuration options for `BridgeConfiguration.customize()`.
 */
export interface BridgePluginOptions {
  /** Additional or overriding framework adapters to register in this DI container. */
  adapters?: readonly BridgeAdapter[];
  /** Whether to register the 6 built-in lazy JS adapters (default: `true`). */
  registerBuiltins?: boolean;
  /** Optional explicit HTMX runtime instance for `au-htmx` Custom Attribute. */
  htmx?: HtmxLike;
}
