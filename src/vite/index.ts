/**
 * @aureliajs/bridge/vite
 *
 * Official Vite Plugin for Aurelia 2 Polyglot Bridge (<au-bridge> + au-htmx).
 * Provides convention-over-configuration transforms for foreign frontend frameworks:
 * - Vue 3 SFCs (.vue)
 * - Svelte 5 Runes (.svelte)
 * - SolidJS JSX (*solid*.tsx/jsx)
 * - Automatic Vue 3 runtime feature flags
 * - Upfront dependency pre-bundling for all 7 polyglot ecosystems
 * - Built-in HTMX dev mock endpoints
 */

export interface BridgeViteOptions {
  /**
   * Whether to enable automatic Vue 3 SFC compilation (.vue).
   * @default true
   */
  vue?: boolean;
  /**
   * Whether to enable automatic Svelte 5 runes compilation (.svelte).
   * @default true
   */
  svelte?: boolean;
  /**
   * Whether to enable automatic SolidJS JSX compilation (*solid*.tsx/jsx).
   * @default true
   */
  solid?: boolean;
  /**
   * Whether to configure HTMX mock API middleware for /api/htmx-demo in dev mode.
   * @default true
   */
  htmxDevDemo?: boolean;
}

export interface MinimalVitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  config?: () => Record<string, unknown>;
  transform?: (code: string, id: string) => Promise<{ code: string; map?: unknown } | null>;
  configureServer?: (server: { middlewares: { use: (route: string, handler: (req: unknown, res: any) => void) => void } }) => void;
}

/**
 * Aurelia 2 Polyglot Bridge Vite Plugin.
 * Eliminates all userland compiler boilerplate across Vue, Svelte, Solid, and HTMX.
 */
export function bridge(options: BridgeViteOptions = {}): MinimalVitePlugin {
  const {
    vue = true,
    svelte = true,
    solid = true,
    htmxDevDemo = true,
  } = options;

  return {
    name: 'aureliajs-bridge',
    enforce: 'pre',
    config() {
      return {
        define: {
          __VUE_OPTIONS_API__: JSON.stringify(true),
          __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
          __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
          'globalThis.qRuntimeQrl': JSON.stringify(true),
        },
        optimizeDeps: {
          include: [
            'aurelia',
            'react',
            'react-dom/client',
            'vue',
            'svelte',
            'solid-js',
            'solid-js/web',
            'preact',
            'preact/hooks',
            '@builder.io/qwik',
            '@builder.io/qwik/loader',
            '@builder.io/qwik/qwikloader.js',
            'htmx.org',
          ],
        },
      };
    },
    async transform(code: string, id: string) {
      // Guard: Skip already transformed files
      const cleanId = id.split('?')[0] ?? id;

      // 1. Vue 3 SFCs
      if (vue && cleanId.endsWith('.vue')) {
        if (!code.includes('<template') && !code.includes('<script')) {
          return null;
        }
        const { parse, compileScript } = await import('@vue/compiler-sfc');
        const { descriptor } = parse(code, { filename: cleanId });
        const compiled = compileScript(descriptor, { id: 'vue-sfc', inlineTemplate: true });
        const { transformWithOxc } = await import('vite');
        const stripped = await transformWithOxc(compiled.content, `${cleanId}.ts`, {
          lang: 'ts',
          target: 'es2022',
        });
        return {
          code: stripped.code,
          map: stripped.map,
        };
      }

      // 2. Svelte 5 Runes
      if (svelte && cleanId.endsWith('.svelte')) {
        if (code.includes('svelte/internal') || (!code.includes('<script') && !code.includes('<'))) {
          return null;
        }
        const { compile: compileSvelte } = await import('svelte/compiler');
        const compiled = compileSvelte(code, { filename: cleanId, generate: 'client', runes: true });
        return {
          code: compiled.js.code,
          map: compiled.js.map,
        };
      }

      // 3. SolidJS JSX Components
      if (solid && cleanId.includes('solid') && (cleanId.endsWith('.tsx') || cleanId.endsWith('.jsx'))) {
        if (code.includes('_tmpl$') || code.includes('/*@__PURE__*/')) {
          return null;
        }
        const babel = await import('@babel/core');
        delete (Error as unknown as { prepareStackTrace?: unknown }).prepareStackTrace;
        const transformed = babel.transformSync(code, {
          filename: cleanId,
          presets: [
            '@babel/preset-typescript',
            ['babel-preset-solid', { generate: 'dom', hydratable: false }],
          ],
        });
        delete (Error as unknown as { prepareStackTrace?: unknown }).prepareStackTrace;
        return {
          code: transformed?.code ?? '',
          map: transformed?.map,
        };
      }

      // 4. Preact TSX/JSX (Automatic JSX Pragma)
      if (cleanId.includes('preact') && (cleanId.endsWith('.tsx') || cleanId.endsWith('.jsx'))) {
        if (!code.includes('@jsxImportSource')) {
          return {
            code: `/** @jsxImportSource preact */\n${code}`,
            map: null,
          };
        }
      }

      // 5. Qwik TSX/JSX (Automatic JSX Pragma)
      if (cleanId.includes('qwik') && (cleanId.endsWith('.tsx') || cleanId.endsWith('.jsx'))) {
        if (!code.includes('@jsxImportSource')) {
          return {
            code: `/** @jsxImportSource @builder.io/qwik */\n${code}`,
            map: null,
          };
        }
      }

      return null;
    },
    configureServer(server) {
      if (htmxDevDemo) {
        server.middlewares.use('/api/htmx-demo', (_req: unknown, res: any) => {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(`
            <div class="htmx-live-banner">
              <span class="htmx-badge">⚡ HTMX 2.0 Live Hypermedia</span>
              <p>Delivered dynamically from the server via <strong>hx-get="/api/htmx-demo"</strong> and swapped into the Aurelia 2 DOM by the <strong>au-htmx</strong> Custom Attribute without any wrapper boilerplate.</p>
              <div class="htmx-meta">Server Time: <code>${new Date().toLocaleTimeString()}</code> • Status: <strong>200 OK</strong></div>
            </div>
          `);
        });
      }
    },
  };
}

export const bridgePlugin = bridge;
export default bridge;
