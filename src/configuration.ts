/**
 * @aureliajs/bridge - Container-Scoped Plugin Configuration
 */

import { Registration, type IContainer, type IRegistry } from 'aurelia';
import {
  AuBridge,
  AuLit,
  AuPreact,
  AuQwik,
  AuReact,
  AuSolid,
  AuSvelte,
  AuVue,
} from './au-bridge';
import { AuHtmx, AuHtmxElement } from './au-htmx';
import { IBridgeRegistry, IHtmx, type BridgePluginOptions } from './types';
import { BridgeRegistry, createDefaultBridgeRegistry } from './adapters';

const BRIDGE_ELEMENTS = [
  AuBridge,
  AuReact,
  AuVue,
  AuSvelte,
  AuSolid,
  AuPreact,
  AuQwik,
  AuLit,
  AuHtmx,
  AuHtmxElement,
];

function createRegistryFromOptions(options: BridgePluginOptions): BridgeRegistry {
  const registry =
    options.registerBuiltins === false ? new BridgeRegistry() : createDefaultBridgeRegistry();

  if (options.adapters) {
    for (const adapter of options.adapters) {
      registry.register(adapter);
    }
  }

  return registry;
}

export const BridgeConfiguration: IRegistry & {
  customize(options?: BridgePluginOptions): IRegistry;
} = {
  register(container: IContainer): IContainer {
    return container.register(
      Registration.instance(IBridgeRegistry, createDefaultBridgeRegistry()),
      ...BRIDGE_ELEMENTS
    );
  },
  customize(options: BridgePluginOptions = {}): IRegistry {
    return {
      register(container: IContainer): IContainer {
        const registry = createRegistryFromOptions(options);
        const registrations: unknown[] = [
          Registration.instance(IBridgeRegistry, registry),
          ...BRIDGE_ELEMENTS,
        ];
        if (options.htmx) {
          registrations.push(Registration.instance(IHtmx, options.htmx));
        }
        return container.register(...registrations);
      },
    };
  },
};
