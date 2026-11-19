/**
 * @aureliajs/bridge - Pure Framework Adapters
 * Maintained by Sandikodev (https://github.com/sandikodev)
 *
 * Strictly generic lifecycle bridges for React, Vue, Svelte, SolidJS, Preact, and Qwik.
 * Zero hardcoded domain props, zero demo event handlers, zero hardcoded DOM selectors.
 */

import type {
  BridgeAdapter,
  BridgeFramework,
  BridgeInstance,
  BridgeMountContext,
  IBridgeRegistry,
} from '../types.js';

export class BridgeRegistry implements IBridgeRegistry {
  private readonly adapters = new Map<string, BridgeAdapter>();

  register(adapter: BridgeAdapter): this {
    this.adapters.set(adapter.framework, adapter);
    return this;
  }

  get(framework: BridgeFramework): BridgeAdapter | undefined {
    return this.adapters.get(framework);
  }

  has(framework: BridgeFramework): boolean {
    return this.adapters.has(framework);
  }

  list(): BridgeFramework[] {
    return Array.from(this.adapters.keys());
  }
}

function buildBridgeProps(
  props: Record<string, unknown>,
  onEvent?: BridgeMountContext['onEvent']
): Record<string, unknown> {
  if (!onEvent) return { ...props };
  return {
    ...props,
    onEvent,
    onChange: (val: unknown) => onEvent('change', val),
    onUpdate: (event: string, payload?: unknown) => onEvent(event, payload),
  };
}

interface ReactLike {
  createElement(component: unknown, props: Record<string, unknown>): unknown;
}

interface ReactDomClientLike {
  createRoot(container: HTMLElement): {
    render(element: unknown): void;
    unmount(): void;
  };
}

/**
 * React 18 / 19 Bridge Adapter
 */
export function createReactAdapter(
  reactModule?: ReactLike,
  reactDomClientModule?: ReactDomClientLike
): BridgeAdapter {
  return {
    framework: 'react',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const React = (reactModule ??
        (await import('react')).default ??
        (await import('react'))) as ReactLike;
      const ReactDOM = (reactDomClientModule ??
        (await import('react-dom/client')).default ??
        (await import('react-dom/client'))) as ReactDomClientLike;

      const root = ReactDOM.createRoot(context.container);
      let currentProps: Record<string, unknown> = { ...context.props };

      const render = () => {
        root.render(
          React.createElement(
            context.component,
            buildBridgeProps(currentProps, context.onEvent)
          )
        );
      };

      render();

      return {
        nativeInstance: root,
        update(nextProps) {
          currentProps = { ...currentProps, ...nextProps };
          render();
        },
        destroy() {
          root.unmount();
        },
      };
    },
  };
}

interface VueLike {
  createApp(rootComponent: { render(): unknown }): {
    mount(container: HTMLElement): unknown;
    unmount(): void;
  };
  h(component: unknown, props: Record<string, unknown>): unknown;
  reactive<T extends Record<string, unknown>>(target: T): T;
}

/**
 * Vue 3 Bridge Adapter
 */
export function createVueAdapter(vueModule?: VueLike): BridgeAdapter {
  return {
    framework: 'vue',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const { createApp, h, reactive } = (vueModule ?? (await import('vue'))) as VueLike;

      const reactiveProps = reactive<Record<string, unknown>>({ ...context.props });
      const app = createApp({
        render() {
          return h(
            context.component,
            buildBridgeProps(reactiveProps, context.onEvent)
          );
        },
      });

      app.mount(context.container);

      return {
        nativeInstance: app,
        update(nextProps) {
          Object.assign(reactiveProps, nextProps);
        },
        destroy() {
          app.unmount();
        },
      };
    },
  };
}

interface SvelteLike {
  mount(
    component: unknown,
    options: { target: HTMLElement; props: Record<string, unknown> }
  ): unknown;
  unmount(instance: unknown): void | Promise<void>;
}

/**
 * Svelte 5 Bridge Adapter
 */
export function createSvelteAdapter(svelteModule?: SvelteLike): BridgeAdapter {
  return {
    framework: 'svelte',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const { mount, unmount } = (svelteModule ?? (await import('svelte'))) as SvelteLike;

      let currentProps: Record<string, unknown> = { ...context.props };
      let instance = mount(context.component, {
        target: context.container,
        props: buildBridgeProps(currentProps, context.onEvent),
      });

      return {
        get nativeInstance() {
          return instance;
        },
        async update(nextProps) {
          currentProps = { ...currentProps, ...nextProps };
          const svelte4 = instance as { $set?: (props: Record<string, unknown>) => void } | null;
          if (svelte4 && typeof svelte4.$set === 'function') {
            svelte4.$set(nextProps);
            return;
          }
          await unmount(instance);
          instance = mount(context.component, {
            target: context.container,
            props: buildBridgeProps(currentProps, context.onEvent),
          });
        },
        async destroy() {
          await unmount(instance);
        },
      };
    },
  };
}

interface SolidWebLike {
  render(code: () => unknown, element: HTMLElement): () => void;
}

interface SolidCoreLike {
  createSignal<T>(value: T): [() => T, (next: T | ((prev: T) => T)) => T];
}

/**
 * SolidJS Bridge Adapter
 */
export function createSolidAdapter(
  solidWebModule?: SolidWebLike,
  solidCoreModule?: SolidCoreLike
): BridgeAdapter {
  return {
    framework: 'solid',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const { render } = (solidWebModule ?? (await import('solid-js/web'))) as SolidWebLike;
      const { createSignal } = (solidCoreModule ?? (await import('solid-js'))) as SolidCoreLike;

      const [getProps, setProps] = createSignal<Record<string, unknown>>({ ...context.props });

      const reactiveProps = new Proxy<Record<string, unknown>>(
        {},
        {
          get(target, prop) {
            if (prop === 'onEvent') return context.onEvent;
            const current = getProps();
            if (typeof prop === 'string' && prop in current) {
              return current[prop];
            }
            return Reflect.get(target, prop);
          },
          has(target, prop) {
            if (prop === 'onEvent' && context.onEvent) return true;
            return prop in getProps() || Reflect.has(target, prop);
          },
          ownKeys(target) {
            const keys = new Set([
              ...Reflect.ownKeys(target),
              ...Object.keys(getProps()),
            ]);
            if (context.onEvent) keys.add('onEvent');
            return Array.from(keys);
          },
          getOwnPropertyDescriptor(target, prop) {
            if (prop === 'onEvent' && context.onEvent) {
              return { configurable: true, enumerable: true, value: context.onEvent };
            }
            const current = getProps();
            if (typeof prop === 'string' && prop in current) {
              return { configurable: true, enumerable: true, value: current[prop] };
            }
            return Reflect.getOwnPropertyDescriptor(target, prop);
          },
        }
      );

      const componentFn = context.component as (props: Record<string, unknown>) => unknown;
      const dispose = render(() => componentFn(reactiveProps), context.container);

      return {
        nativeInstance: dispose,
        update(nextProps) {
          setProps((prev) => ({ ...prev, ...nextProps }));
        },
        destroy() {
          dispose();
        },
      };
    },
  };
}

interface PreactLike {
  render(vnode: unknown, container: HTMLElement): void;
  h(component: unknown, props: Record<string, unknown>): unknown;
}

/**
 * Preact Bridge Adapter
 */
export function createPreactAdapter(preactModule?: PreactLike): BridgeAdapter {
  return {
    framework: 'preact',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const { render, h } = (preactModule ?? (await import('preact'))) as PreactLike;
      let currentProps: Record<string, unknown> = { ...context.props };

      const doRender = () => {
        render(
          h(context.component, buildBridgeProps(currentProps, context.onEvent)),
          context.container
        );
      };

      doRender();

      return {
        nativeInstance: context.container,
        update(nextProps) {
          currentProps = { ...currentProps, ...nextProps };
          doRender();
        },
        destroy() {
          render(null, context.container);
        },
      };
    },
  };
}

interface QwikLike {
  render(parent: HTMLElement, jsxNode: unknown): Promise<unknown> | unknown;
  jsx(component: unknown, props: Record<string, unknown>): unknown;
}

/**
 * Qwik Bridge Adapter
 */
export function createQwikAdapter(qwikModule?: QwikLike): BridgeAdapter {
  return {
    framework: 'qwik',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      const { render, jsx } = (qwikModule ??
        (await import('@builder.io/qwik'))) as QwikLike;

      context.container.innerHTML = '';
      const doc = context.container.ownerDocument;
      const host = doc.createElement('div');
      context.container.appendChild(host);

      let currentProps: Record<string, unknown> = { ...context.props };

      const doRender = async () => {
        await render(
          host,
          jsx(context.component, buildBridgeProps(currentProps, context.onEvent))
        );
      };

      await doRender();

      return {
        nativeInstance: host,
        async update(nextProps) {
          currentProps = { ...currentProps, ...nextProps };
          await doRender();
        },
        destroy() {
          context.container.innerHTML = '';
        },
      };
    },
  };
}

/**
 * Lit 3 / W3C Custom Element Bridge Adapter
 */
export function createLitAdapter(): BridgeAdapter {
  return {
    framework: 'lit',
    async mount(context: BridgeMountContext): Promise<BridgeInstance> {
      context.container.innerHTML = '';
      const doc = context.container.ownerDocument;
      let el: HTMLElement;

      if (typeof context.component === 'string') {
        el = doc.createElement(context.component);
      } else if (typeof context.component === 'function') {
        const CompClass = context.component as { new (): HTMLElement };
        el = new CompClass();
      } else if (context.component && typeof context.component === 'object') {
        el = context.component as HTMLElement;
      } else {
        throw new Error('[@aureliajs/bridge] Lit adapter requires a CustomElement class, tag name string, or HTMLElement instance');
      }

      const applyProps = (props: Record<string, unknown>) => {
        for (const [key, val] of Object.entries(props)) {
          (el as unknown as Record<string, unknown>)[key] = val;
        }
        if (context.onEvent) {
          (el as unknown as { onEvent?: BridgeMountContext['onEvent'] }).onEvent = context.onEvent;
        }
      };

      applyProps(context.props);
      context.container.appendChild(el);

      return {
        nativeInstance: el,
        update(nextProps) {
          applyProps(nextProps);
        },
        destroy() {
          context.container.innerHTML = '';
        },
      };
    },
  };
}

/**
 * Factory creating a fresh container-scoped `BridgeRegistry` with the 7 built-in lazy adapters.
 */
export function createDefaultBridgeRegistry(): BridgeRegistry {
  return new BridgeRegistry()
    .register(createReactAdapter())
    .register(createVueAdapter())
    .register(createSvelteAdapter())
    .register(createSolidAdapter())
    .register(createPreactAdapter())
    .register(createQwikAdapter())
    .register(createLitAdapter());
}
