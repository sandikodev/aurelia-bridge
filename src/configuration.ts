/**
 * @aureliajs/bridge - Container-Scoped Plugin Configuration
 */

import { Registration, type IContainer, type IRegistry } from 'aurelia';
import { AuBridge } from './au-bridge.js';
import { AuHtmx } from './au-htmx.js';
import { IBridgeRegistry, IHtmx, type BridgePluginOptions } from './types.js';
import { BridgeRegistry, createDefaultBridgeRegistry } from './adapters/index.js';

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
      AuBridge,
      AuHtmx
    );
  },
  customize(options: BridgePluginOptions = {}): IRegistry {
    return {
      register(container: IContainer): IContainer {
        const registry = createRegistryFromOptions(options);
        const registrations: unknown[] = [
          Registration.instance(IBridgeRegistry, registry),
          AuBridge,
          AuHtmx,
        ];
        if (options.htmx) {
          registrations.push(Registration.instance(IHtmx, options.htmx));
        }
        return container.register(...registrations);
      },
    };
  },
};
