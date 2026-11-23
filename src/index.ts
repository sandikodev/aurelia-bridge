/**
 * @aureliajs/bridge - Public API
 * Maintained by Sandikodev (https://github.com/sandikodev)
 */

export {
  AuBridge,
  AuReact,
  AuVue,
  AuSvelte,
  AuSolid,
  AuPreact,
  AuQwik,
  AuLit,
  createBridgeElement,
  detectFramework,
} from './au-bridge';

export {
  AuHtmx,
  AuHtmxElement,
} from './au-htmx';

export {
  BridgeConfiguration,
} from './configuration';

export {
  BridgeRegistry,
  createDefaultBridgeRegistry,
  createReactAdapter,
  createVueAdapter,
  createSvelteAdapter,
  createSolidAdapter,
  createPreactAdapter,
  createQwikAdapter,
  createLitAdapter,
} from './adapters';

export {
  defineBridgeAdapter,
  IBridgeRegistry,
  IHtmx,
} from './types';

export type {
  BridgeFramework,
  BridgeAdapter,
  BridgeMountContext,
  BridgeInstance,
  BridgeEventHandler,
  BridgeComponentInput,
  BridgePluginOptions,
  HtmxLike,
  IBridgeRegistry as IBridgeRegistryType,
  IHtmx as IHtmxType,
} from './types';
