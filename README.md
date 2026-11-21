# `@aureliajs/bridge`

**Pure, Container-Scoped Polyglot Foreign Framework Interop & Hypermedia Bridge for Aurelia 2.**

[![Aurelia 2](https://img.shields.io/badge/Aurelia-v2.0.0--rc.2-ED2B88)](https://aurelia.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Community Note:** `@aureliajs/bridge` is an independent open-source package by **Sandikodev ([@sandikodev](https://github.com/sandikodev))**. Real enterprise teams rarely rewrite an entire application overnight — they embed an existing React chart, a Vue design system widget, a Svelte 5 interactive control, or HTMX hypermedia regions inside Aurelia 2. `@aureliajs/bridge` makes that interop strictly typed, lazy, race-safe, and DI-native.
>
> 📖 **Architectural Study & Guiding Principles:** Read [ARCHITECTURAL-STUDY.md](./ARCHITECTURAL-STUDY.md) for an in-depth comparative analysis between the manual wrappers from docs.aurelia.io, ergonomic community implementations, and our resilient blueprint for foreign framework interop.

---

## 1. Scope & Strict Boundaries

### What `@aureliajs/bridge` OWNS (**WHAT** foreign UI runtime mounts inside Aurelia)
- `<au-bridge>` native Aurelia 2 Custom Element (`static readonly $au`) for mounting foreign UI subtrees with lazy `() => import(...)` loaders, reactive `props` forwarding, standardized `bridge-event` dispatch, and deterministic teardown.
- `au-htmx` native Aurelia 2 Custom Attribute (`static readonly $au`) for enhancing existing DOM elements directly with HTMX — zero wrapper `<div>`s.
- Container-scoped `IBridgeRegistry` DI service (never a global mutable map!).
- 6 lazy built-in adapters (`React 18/19`, `Vue 3`, `Svelte 5`, `SolidJS`, `Preact`, `Qwik`) plus `defineBridgeAdapter()` for any custom runtime (Lit, Angular Elements, Three.js, D3, WebGL).

### What `@aureliajs/bridge` Explicitly DOES NOT OWN (**WHEN / HOW** components hydrate)
- `IntersectionObserver`, `requestIdleCallback`, `matchMedia`, or Zero-JS SSR island loading. Those concerns live in [`@aureliajs/islands`](../aurelia-islands/README.md) and compose orthogonally by adding `island="visible"` directly onto `<au-bridge>`.

---

## 2. How It Works Under the Hood

1. **Container-Scoped DI (`IBridgeRegistry` & `IHtmx`)**:
   - `BridgeConfiguration` registers a fresh `BridgeRegistry` instance **per Aurelia DI container** (`Registration.instance(IBridgeRegistry, ...)`).
   - Two apps or parallel tests running in the same process never pollute each other's adapter registries.
2. **Race-Safe Async Mounting (`mountEpoch`)**:
   - Loading a foreign chunk (`loader.bind="() => import('./Chart.tsx')"`) and dynamically importing `react` / `react-dom/client` are asynchronous.
   - If the user navigates away or changes `using`/`component` before the `import()` finishes, a monotonic `mountEpoch` counter inside [src/au-bridge.ts](./src/au-bridge.ts) immediately discards stale mounts and calls `destroy()` on any late-resolved instance — preventing orphaned roots and memory leaks.
3. **Standardized Bi-Directional Communication**:
   - **Aurelia → Foreign**: Bind `props.bind="chartData"`. Whenever `props` changes, `AuBridge` calls `instance.update(nextProps)`.
   - **Foreign → Aurelia**: Every adapter injects `onEvent(eventName, payload)`. Calling it triggers both the bound `on-event.bind` callback AND dispatches a bubbling, shadow-crossing `CustomEvent('bridge-event', { detail: { framework, event, payload } })` on `<au-bridge>`.
4. **Zero-Wrapper Hypermedia (`au-htmx`)**:
   - Because `au-htmx` is an Aurelia Custom Attribute (`<section au-htmx hx-get="/feed">`), it calls `htmx.process(hostElement)` directly on `attached()` and removes no semantic HTML structure. HTMX can be supplied via DI (`BridgeConfiguration.customize({ htmx })`) or discovered automatically from `window.htmx`.

---

## 3. Installation

```bash
bun add @aureliajs/bridge aurelia
```

All foreign framework packages (`react`, `react-dom`, `vue`, `svelte`, `solid-js`, `preact`, `@builder.io/qwik`, `htmx.org`) are **optional peer dependencies** — install only the ones you actually mount.

---

## 4. Usage

### 1. Register `BridgeConfiguration`

```ts
import Aurelia from 'aurelia';
import { BridgeConfiguration } from '@aureliajs/bridge';
import { App } from './app.js';

Aurelia.register(BridgeConfiguration).app(App).start();
```

Customizing per container (e.g., adding custom adapters, disabling built-ins, or injecting `htmx` via DI):

```ts
Aurelia.register(
  BridgeConfiguration.customize({
    registerBuiltins: true,
    adapters: [myThreeJsAdapter],
    htmx: myHtmxModule,
  })
).app(App).start();
```

### 2. Mount Foreign Components with `<au-bridge>`

```ts
export class AnalyticsPage {
  chartProps = { metric: 'MRR', value: 42 };

  // Dynamic import keeps React + Recharts out of the initial Aurelia bundle
  loadChart = () => import('./react/RevenueChart.tsx');

  handleBridgeEvent = (event: string, payload: unknown) => {
    console.log('From React:', event, payload);
  };
}
```

```html
<!-- 1. Dedicated Convention Elements (<au-react>, <au-vue>, <au-svelte>, <au-solid>, <au-preact>, <au-qwik>, <au-lit>) -->
<au-react
  component.bind="loadChart"
  props.bind="chartProps"
  on-event.bind="handleBridgeEvent">
</au-react>

<!-- 2. Two-way binding by default on value.bind (zero on-change boilerplate) -->
<au-vue
  component.bind="VueCounter"
  value.bind="sharedCount">
</au-vue>

<!-- 3. Generic <au-bridge> with Automatic Framework Detection -->
<au-bridge
  component.bind="SvelteWidget"
  value.bind="sharedCount">
</au-bridge>

<!-- 4. Orthogonal composition with @aureliajs/islands for lazy viewport mounting (0 KB React until visible) -->
<au-react
  island="visible"
  component.bind="loadChart"
  props.bind="chartProps">
</au-react>
```

### 3. Hypermedia Regions with `au-htmx`

Enhance any DOM node directly with HTMX without wrapping extra `<div>` elements:

```html
<section au-htmx hx-get="/partials/activity-feed" hx-trigger="revealed" hx-swap="innerHTML">
  Loading feed...
</section>

<!-- Direct hypermedia swap inside Aurelia components -->
<div au-htmx>
  <button hx-get="/api/stats" hx-target="#stats-panel" hx-swap="innerHTML">
    Refresh Stats
  </button>
  <div id="stats-panel"></div>
</div>
```

### 4. Authoring a Custom Adapter (`defineBridgeAdapter`)

Any imperative library (Lit, D3, Three.js, MapLibre, Monaco Editor) fits cleanly into the same lifecycle contract:

```ts
import { defineBridgeAdapter } from '@aureliajs/bridge';

interface MapProps {
  center: [number, number];
  zoom: number;
}

export const mapAdapter = defineBridgeAdapter<MapProps>({
  framework: 'maplibre',
  mount({ container, props, onEvent }) {
    const map = createMap(container, props);
    map.on('click', (coords) => onEvent?.('map:click', coords));

    return {
      nativeInstance: map,
      update(nextProps) {
        if (nextProps.center) map.setCenter(nextProps.center);
        if (nextProps.zoom !== undefined) map.setZoom(nextProps.zoom);
      },
      destroy() {
        map.remove();
      },
    };
  },
});
```

---

## 5. Built-in Adapters: Exact Behavior & Honest Trade-offs

We document each built-in adapter's real runtime mechanics ([src/adapters/index.ts](./src/adapters/index.ts)) openly so there are no surprises:

| Framework (`using="..."`) | Underlying Mount API | How `update(nextProps)` Works | Honest Trade-offs / Notes |
| :--- | :--- | :--- | :--- |
| **`react`** | `ReactDOM.createRoot(el)` + `root.render(...)` | Re-renders root with merged props | Full React 18/19 concurrent root support; clean `root.unmount()`. |
| **`vue`** | `createApp({ render: () => h(Comp, reactiveProps) })` | Mutates Vue `reactive()` object via `Object.assign` | Preserves Vue component internal state across prop updates; clean `app.unmount()`. |
| **`svelte`** | Svelte 5 `mount(Comp, { target, props })` | Calls `$set()` if Svelte 4; on Svelte 5 currently calls `unmount()` + re-`mount()` | **Open improvement area**: wrapping props in Svelte 5 `$state` proxy (when available) would preserve internal Svelte 5 component state across prop updates without remounting! |
| **`solid`** | `render(() => Comp(reactiveProxy), el)` + `createSignal` | Updates signal via `setProps()`, read lazily through a `Proxy` | Fine-grained reactivity without remounting the Solid tree; clean `dispose()`. |
| **`preact`** | `render(h(Comp, props), el)` | Re-renders VNode into container | Tiny footprint; teardown calls `render(null, el)`. |
| **`qwik`** | Client-side `render(host, jsx(Comp, props))` | Re-renders JSX node into host | **Honest note**: runs Qwik's client renderer inside Aurelia, *not* Qwik City's server-side QRL resumability pipeline. |

---

## 6. Subpath Contract

| Subpath | Runtime Dependencies | Key Exports |
| :--- | :--- | :--- |
| `@aureliajs/bridge` | `aurelia` | `BridgeConfiguration`, `AuBridge`, `AuHtmx`, `IBridgeRegistry`, `IHtmx`, `BridgeRegistry`, `createDefaultBridgeRegistry`, `defineBridgeAdapter`, all 6 `create*Adapter()` factories, generic types |
| `@aureliajs/bridge/adapters` | **None (0 KB Aurelia)** | `BridgeRegistry`, `createDefaultBridgeRegistry`, `createReactAdapter`, `createVueAdapter`, `createSvelteAdapter`, `createSolidAdapter`, `createPreactAdapter`, `createQwikAdapter` (usable directly with `@aureliajs/islands/loader` on Zero-JS pages!) |
| `@aureliajs/bridge/vite` | `vite` | `bridge()`, `bridgePlugin` (Zero-boilerplate Vite plugin providing on-the-fly compilation for Vue SFCs, Svelte 5 runes, SolidJS JSX, and dev mock endpoints) |

### Zero-Boilerplate Vite Plugin (`@aureliajs/bridge/vite`)

To avoid configuring Babel, `@vue/compiler-sfc`, and Svelte compilers manually in your `vite.config.ts`, simply add `bridge()`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import aurelia from '@aurelia/vite-plugin';
import { bridge } from '@aureliajs/bridge/vite';

export default defineConfig({
  plugins: [
    bridge(),
    aurelia({ useDev: false }),
  ],
});
```

---

## 7. Open Areas for Community Contributions

1. **Non-Remounting Svelte 5 Props Bridge**: Preserve internal Svelte 5 component state on `update(nextProps)` without `unmount()` + re-`mount()`.
2. **Deep / Key-Level Prop Diffing Option**: Currently `AuBridge.propsChanged()` fires when the `props` object reference changes (immutable style). Adding optional shallow-equality or deep observation helpers for mutable objects can be explored cleanly.
3. **Server-Side Fallback / SSR Bridge Hooks**: Optional `renderToString` hook on `BridgeAdapter` so `<au-bridge>` can optionally pre-render React/Vue HTML during `@aureliajs/ssr` renders instead of leaving an empty mount container until client boot.

---

## 8. Testing

```bash
cd packages/aurelia-bridge
bun run build
bun run typecheck
bun test
```
