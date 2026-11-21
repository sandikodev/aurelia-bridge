import { describe, it, expect, vi } from 'bun:test';
import { JSDOM } from 'jsdom';
import { Aurelia, CustomElement, DI, IPlatform, ITemplateElementFactory, Registration } from 'aurelia';
import { StandardConfiguration } from '@aurelia/runtime-html';
import { BrowserPlatform } from '@aurelia/platform-browser';
import {
  AuBridge,
  AuHtmx,
  BridgeConfiguration,
  BridgeRegistry,
  IBridgeRegistry,
  createDefaultBridgeRegistry,
  createPreactAdapter,
  createQwikAdapter,
  createReactAdapter,
  createSolidAdapter,
  createSvelteAdapter,
  createVueAdapter,
  defineBridgeAdapter,
  type HtmxLike,
} from '../src/index.js';

function createScopedAurelia() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="host"></div></body></html>', {
    url: 'http://localhost/',
  });
  const win = dom.window as unknown as typeof globalThis;
  const platform = new BrowserPlatform(win);
  const templateFactory: ITemplateElementFactory = {
    createTemplate(input: string | Node): HTMLTemplateElement {
      if (typeof input === 'string') {
        const tpl = dom.window.document.createElement('template');
        tpl.innerHTML = input;
        return tpl;
      }
      if (input.nodeName !== 'TEMPLATE') {
        const tpl = dom.window.document.createElement('template');
        tpl.content.appendChild(input);
        return tpl;
      }
      return input as HTMLTemplateElement;
    },
  };
  const container = DI.createContainer();
  container.register(
    StandardConfiguration,
    Registration.instance(IPlatform, platform),
    Registration.instance(ITemplateElementFactory, templateFactory)
  );
  const app = new Aurelia(container);
  const host = dom.window.document.getElementById('host')!;
  return { dom, app, container, host };
}

describe('@aureliajs/bridge — Polyglot Framework Interop & Hypermedia', () => {
  it('creates isolated default registries and registers container-scoped IBridgeRegistry', () => {
    const regA = createDefaultBridgeRegistry();
    const regB = createDefaultBridgeRegistry();
    expect(regA).not.toBe(regB);
    expect(regA.list()).toEqual(['react', 'vue', 'svelte', 'solid', 'preact', 'qwik', 'lit']);

    const customAdapter = defineBridgeAdapter({
      framework: 'custom-foo',
      mount: () => ({ update: () => {}, destroy: () => {} }),
    });

    const containerA = DI.createContainer();
    containerA.register(
      BridgeConfiguration.customize({ registerBuiltins: false, adapters: [customAdapter] })
    );
    const containerB = DI.createContainer();
    containerB.register(BridgeConfiguration);

    expect(containerA.get(IBridgeRegistry).has('custom-foo')).toBe(true);
    expect(containerA.get(IBridgeRegistry).has('react')).toBe(false);
    expect(containerB.get(IBridgeRegistry).has('custom-foo')).toBe(false);
    expect(containerB.get(IBridgeRegistry).has('lit')).toBe(true);
    expect(containerB.get(IBridgeRegistry).has('react')).toBe(true);
    expect(AuBridge).toBeDefined();
    expect(AuHtmx).toBeDefined();
  });

  it('mounts <au-bridge> in real Aurelia 2 runtime with lazy loader, live props updates, events, and teardown', async () => {
    const { dom, app, host } = createScopedAurelia();
    const updateSpy = vi.fn();
    const destroySpy = vi.fn();
    let capturedOnEvent: ((event: string, payload?: unknown) => void) | undefined;

    const mockAdapter = defineBridgeAdapter<{ title: string }>({
      framework: 'react',
      mount({ container, component, props, onEvent }) {
        capturedOnEvent = onEvent;
        const el = container.ownerDocument.createElement('span');
        el.textContent = `${String(component)}:${props.title}`;
        container.appendChild(el);

        return {
          update(nextProps) {
            updateSpy(nextProps);
            if (nextProps.title !== undefined) {
              el.textContent = `${String(component)}:${nextProps.title}`;
            }
          },
          destroy() {
            destroySpy();
            container.innerHTML = '';
          },
        };
      },
    });

    const lazyLoaderSpy = vi.fn(async () => ({ default: 'SalesChart' }));
    const receivedEvents: Array<{ event: string; payload: unknown }> = [];
    const domEvents: Array<{ framework: string; event: string; payload: unknown }> = [];

    const AppShell = CustomElement.define(
      {
        name: 'bridge-test-shell',
        template: `<au-bridge using="react" component.bind="loadChart" props.bind="chartProps" on-event.bind="handleEvent"></au-bridge>`,
      },
      class {
        loadChart = lazyLoaderSpy;
        chartProps = { title: 'Q1 Revenue' };
        handleEvent = (event: string, payload?: unknown) => {
          receivedEvents.push({ event, payload });
        };
      }
    );

    host.addEventListener('bridge-event', (e: Event) => {
      domEvents.push((e as CustomEvent).detail);
    });

    app.register(
      BridgeConfiguration.customize({ registerBuiltins: false, adapters: [mockAdapter] })
    );
    const vm = app.container.get(AppShell);
    await app.app({ host, component: vm }).start();

    // Wait microtasks for async lazy loader
    await new Promise((r) => setTimeout(r, 10));

    expect(lazyLoaderSpy).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('SalesChart:Q1 Revenue');

    // Trigger event from foreign component -> propagates to both callback and DOM CustomEvent
    capturedOnEvent?.('bar:click', { month: 'Jan' });
    expect(receivedEvents).toEqual([{ event: 'bar:click', payload: { month: 'Jan' } }]);
    expect(domEvents).toEqual([
      { framework: 'react', event: 'bar:click', payload: { month: 'Jan' } },
    ]);

    // Reactive props change in Aurelia ViewModel propagates to foreign component
    vm.chartProps = { title: 'Q2 Revenue' };
    await new Promise((r) => setTimeout(r, 10));
    expect(updateSpy).toHaveBeenCalledWith({ title: 'Q2 Revenue' });
    expect(host.textContent).toContain('SalesChart:Q2 Revenue');

    // Clean teardown on Aurelia stop
    await app.stop();
    expect(destroySpy).toHaveBeenCalledTimes(1);

    app.dispose();
    dom.window.close();
  });

  it('supports direct ergonomic binding with value.bind and on-change.bind', async () => {
    const { dom, app, host } = createScopedAurelia();
    let triggerChange: ((val: number) => void) | undefined;

    const mockAdapter = defineBridgeAdapter<{ value: number }>({
      framework: 'vue',
      mount({ container, props, onEvent }) {
        const span = container.ownerDocument.createElement('span');
        span.className = 'val';
        span.textContent = String(props.value);
        container.appendChild(span);

        triggerChange = (val: number) => {
          onEvent?.('change', val);
        };

        return {
          update(nextProps) {
            if (nextProps.value !== undefined) {
              span.textContent = String(nextProps.value);
            }
          },
          destroy() {
            container.innerHTML = '';
          },
        };
      },
    });

    const AppShell = CustomElement.define(
      {
        name: 'ergonomic-test-shell',
        template: `<au-bridge using="vue" component.bind="VueCounter" value.bind="count"></au-bridge>`,
      },
      class {
        VueCounter = { name: 'VueCounter' };
        count = 42;
      }
    );

    app.register(
      BridgeConfiguration.customize({ registerBuiltins: false, adapters: [mockAdapter] })
    );
    const vm = app.container.get(AppShell);
    await app.app({ host, component: vm }).start();
    await new Promise((r) => setTimeout(r, 10));

    expect(host.querySelector('.val')?.textContent).toBe('42');

    // Aurelia ViewModel change -> Foreign component updates
    vm.count = 43;
    await new Promise((r) => setTimeout(r, 10));
    expect(host.querySelector('.val')?.textContent).toBe('43');

    // Foreign component triggers onChange -> Aurelia ViewModel two-way updates automatically
    triggerChange?.(100);
    expect(vm.count).toBe(100);

    await app.stop();
    app.dispose();
    dom.window.close();
  });

  it('supports dedicated <au-react> convention element and two-way value binding without manual on-change.bind', async () => {
    const { dom, app, host } = createScopedAurelia();

    let triggerChange: ((next: unknown) => void) | undefined;
    const mockAdapter = defineBridgeAdapter({
      framework: 'react',
      mount(ctx) {
        triggerChange = (next: unknown) => ctx.onEvent?.('change', next);
        const span = dom.window.document.createElement('span');
        span.className = 'react-val';
        span.textContent = String(ctx.props.value ?? '');
        ctx.container.appendChild(span);
        return {
          update(newProps) {
            span.textContent = String(newProps.value ?? '');
          },
          destroy() {
            span.remove();
          },
        };
      },
    });

    const DedicatedShell = CustomElement.define(
      {
        name: 'dedicated-shell',
        template: `
          <au-react
            component.bind="ReactCounter"
            value.bind="sharedCounter">
          </au-react>
        `,
      },
      class {
        ReactCounter = { name: 'ReactCounter' };
        sharedCounter = 10;
      }
    );

    app.register(
      BridgeConfiguration.customize({ registerBuiltins: false, adapters: [mockAdapter] })
    );
    const vm = app.container.get(DedicatedShell);
    await app.app({ host, component: vm }).start();
    await new Promise((r) => setTimeout(r, 10));

    expect(host.querySelector('.react-val')?.textContent).toBe('10');

    // Aurelia -> React update
    vm.sharedCounter = 25;
    await new Promise((r) => setTimeout(r, 10));
    expect(host.querySelector('.react-val')?.textContent).toBe('25');

    // React -> Aurelia two-way update
    triggerChange?.(99);
    expect(vm.sharedCounter).toBe(99);

    await app.stop();
    app.dispose();
    dom.window.close();
  });

  it('enhances existing DOM elements natively via `au-htmx` Custom Attribute without wrapper divs', async () => {
    const { dom, app, host } = createScopedAurelia();
    const processSpy = vi.fn();
    const mockHtmx: HtmxLike = { process: processSpy };

    const FeedPage = CustomElement.define(
      {
        name: 'htmx-feed-page',
        template: `<section id="feed" au-htmx hx-get="/partials/feed" hx-trigger="load">Loading...</section>`,
      },
      class {}
    );

    app.register(BridgeConfiguration.customize({ registerBuiltins: false, htmx: mockHtmx }));
    await app.app({ host, component: FeedPage }).start();

    const section = host.querySelector('#feed');
    expect(section).not.toBeNull();
    expect(section?.getAttribute('hx-get')).toBe('/partials/feed');
    expect(processSpy).toHaveBeenCalledTimes(1);
    expect(processSpy).toHaveBeenCalledWith(section);

    await app.stop();
    app.dispose();
    dom.window.close();
  });

  it('verifies all 6 built-in JS framework adapters pass pure props + onEvent with zero demo boilerplate', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    const makeContainer = () => dom.window.document.createElement('div');
    const onEvent = vi.fn();

    // 1. React
    const reactRender = vi.fn();
    const reactUnmount = vi.fn();
    const mockReact = { createElement: vi.fn((c: unknown, p: Record<string, unknown>) => ({ c, p })) };
    const reactInst = await createReactAdapter(mockReact, {
      createRoot: () => ({ render: reactRender, unmount: reactUnmount }),
    }).mount({ container: makeContainer(), component: () => null, props: { a: 1 }, onEvent });
    expect(mockReact.createElement.mock.calls[0]?.[1]).toMatchObject({ a: 1, onEvent });
    await reactInst.update({ a: 2 });
    await reactInst.destroy();
    expect(reactUnmount).toHaveBeenCalled();

    // 2. Vue
    const vueUnmount = vi.fn();
    const mockVue = {
      createApp: vi.fn((opts: { render: () => unknown }) => {
        opts.render();
        return { mount: vi.fn(), unmount: vueUnmount };
      }),
      h: vi.fn((c: unknown, p: Record<string, unknown>) => ({ c, p })),
      reactive: vi.fn(<T extends Record<string, unknown>>(v: T) => ({ ...v })),
    };
    const vueInst = await createVueAdapter(mockVue).mount({
      container: makeContainer(),
      component: {},
      props: { b: 2 },
      onEvent,
    });
    expect(mockVue.h.mock.calls[0]?.[1]).toMatchObject({ b: 2, onEvent });
    await vueInst.destroy();
    expect(vueUnmount).toHaveBeenCalled();

    // 3. Svelte
    const svelteUnmount = vi.fn();
    const mockSvelte = {
      mount: vi.fn((_component: unknown, _options: { target: HTMLElement; props: Record<string, unknown> }) => ({})),
      unmount: svelteUnmount,
    };
    const svelteInst = await createSvelteAdapter(mockSvelte).mount({
      container: makeContainer(),
      component: {},
      props: { c: 3 },
      onEvent,
    });
    expect(mockSvelte.mount.mock.calls[0]?.[1]?.props).toMatchObject({ c: 3, onEvent });
    await svelteInst.update({ c: 4 });
    expect(mockSvelte.mount).toHaveBeenCalledTimes(2);
    await svelteInst.destroy();
    expect(svelteUnmount).toHaveBeenCalledTimes(2);

    // 4. Solid
    const solidDispose = vi.fn();
    let capturedSolidProps: Record<string, unknown> = {};
    const solidInst = await createSolidAdapter(
      {
        render: (fn) => {
          fn();
          return solidDispose;
        },
      },
      {
        createSignal: <T,>(init: T): [() => T, (next: T | ((prev: T) => T)) => T] => {
          let v = init;
          return [
            () => v,
            (next) => {
              v = typeof next === 'function' ? (next as (p: T) => T)(v) : next;
              return v;
            },
          ];
        },
      }
    ).mount({
      container: makeContainer(),
      component: (p: Record<string, unknown>) => {
        capturedSolidProps = p;
      },
      props: { mode: 'view' },
      onEvent,
    });
    expect(capturedSolidProps.mode).toBe('view');
    expect(capturedSolidProps.onEvent).toBe(onEvent);
    await solidInst.update({ mode: 'edit' });
    expect(capturedSolidProps.mode).toBe('edit');
    await solidInst.destroy();
    expect(solidDispose).toHaveBeenCalled();

    // 5. Preact
    const preactRender = vi.fn();
    const mockPreact = { render: preactRender, h: vi.fn((c: unknown, p: Record<string, unknown>) => ({ c, p })) };
    const preactInst = await createPreactAdapter(mockPreact).mount({
      container: makeContainer(),
      component: () => null,
      props: { p: 1 },
      onEvent,
    });
    expect(mockPreact.h.mock.calls[0]?.[1]).toMatchObject({ p: 1, onEvent });
    await preactInst.destroy();
    expect(preactRender).toHaveBeenLastCalledWith(null, expect.anything());

    // 6. Qwik
    const qwikRender = vi.fn().mockResolvedValue(undefined);
    const mockQwik = { render: qwikRender, jsx: vi.fn((c: unknown, p: Record<string, unknown>) => ({ c, p })) };
    const qwikInst = await createQwikAdapter(mockQwik).mount({
      container: makeContainer(),
      component: () => null,
      props: { q: 1 },
      onEvent,
    });
    expect(mockQwik.jsx.mock.calls[0]?.[1]).toMatchObject({ q: 1, onEvent });
    await qwikInst.update({ q: 2 });
    expect(qwikRender).toHaveBeenCalledTimes(2);
    await qwikInst.destroy();

    const customReg = new BridgeRegistry();
    expect(customReg.list()).toEqual([]);

    dom.window.close();
  });
});
