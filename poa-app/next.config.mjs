import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// E2E mode: pull burner key + passkey seed + Pimlico key from a single
// machine-level file so workspaces don't need per-clone env files. Only runs
// when the explicit E2E flag is set, so production builds never read the file
// even if it exists.
const E2E_ON = process.env.NEXT_PUBLIC_E2E_MODE === 'true';
if (E2E_ON) {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const e2eEnvPath = path.join(os.homedir(), '.poa', 'e2e.env');
  if (fs.existsSync(e2eEnvPath)) {
    for (const line of fs.readFileSync(e2eEnvPath, 'utf8').split('\n')) {
      const m = line.match(/^POA_(.+?)=(.*)$/);
      if (!m) continue;
      let key = m[1];
      // The Pimlico API key matches the production env name with no E2E prefix.
      if (key === 'E2E_PIMLICO_API_KEY' || key === 'PIMLICO_API_KEY') {
        key = 'PIMLICO_API_KEY';
      }
      const targetKey = `NEXT_PUBLIC_${key}`;
      if (!process.env[targetKey]) process.env[targetKey] = m[2];
    }
  } else {
    console.warn(`[e2e] NEXT_PUBLIC_E2E_MODE=true but ${e2eEnvPath} not found. Run: node scripts/e2e/setup-machine.js`);
  }
}

// Force-inline the E2E env vars at build time. Next.js only does literal
// substitution when an env var is *defined* at build; missing ones stay as
// runtime lookups against the `process.env` polyfill — which defeats
// `if (E2E_ENABLED)` tree-shaking. Defaulting to empty/'false' here gives
// webpack a constant to fold against in production builds.
const e2eEnvInlines = {
  NEXT_PUBLIC_E2E_MODE: E2E_ON ? 'true' : 'false',
  NEXT_PUBLIC_E2E_BURNER_PK: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_BURNER_PK || '') : '',
  NEXT_PUBLIC_E2E_PASSKEY_SEED: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_PASSKEY_SEED || '') : '',
  NEXT_PUBLIC_E2E_ORG_NAME: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_ORG_NAME || 'Test6') : '',
  NEXT_PUBLIC_E2E_HAT_ID: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_HAT_ID || '') : '',
  NEXT_PUBLIC_E2E_ORG_ID: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_ORG_ID || '') : '',
  NEXT_PUBLIC_E2E_AS: E2E_ON ? (process.env.NEXT_PUBLIC_E2E_AS || 'eoa') : '',
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 otherwise writes generated AGENTS.md/CLAUDE.md files into the app
  // directory every time the dev server starts.
  agentRules: false,
  reactStrictMode: true,
  trailingSlash: true,
  output: 'export',
  compiler: {
    // Keep verbose deployment/IPFS diagnostics available in development while
    // preventing debug data and logging code from shipping to browsers.
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false,
  },
  images: {
    unoptimized: true,
  },
  webpack: (config, { webpack, isServer }) => {
    // Force-inline the E2E env vars as string literals. Next.js's `env`
    // config field skips empty-string values, leaving them as runtime lookups
    // (`process.env.NEXT_PUBLIC_X || ""`) which keeps the env var names in
    // the production bundle. DefinePlugin substitutes them unconditionally.
    config.plugins.push(new webpack.DefinePlugin(
      Object.fromEntries(
        Object.entries(e2eEnvInlines).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
      ),
    ));

    // Client-side ZK Email proving (snarkjs + @zk-email/helpers, dynamically imported only on the
    // /claim prove path) pull in Node built-ins. webpack 5 ignores resolve.fallback for `node:`-
    // scheme imports, so strip the prefix first, then polyfill the modules the DKIM parser + snarkjs
    // actually use at runtime (streams/crypto/buffer), and stub the truly node-only ones.
    // Client bundle ONLY: the static-export/data-collection pass runs in Node and needs the real
    // built-ins (e.g. process.cwd() for getStaticPaths), so never shim them server-side.
    if (isServer) return config;
    // Keep every statically reachable public/read module out of the shared
    // application group. SSR-preloaded dynamic providers count as async chunks
    // to webpack, so a plain `chunks: 'async'` rule cannot protect public pages.
    if (process.env.NODE_ENV === 'production') {
      let protectedModules = new Set();
      let publicEntryModules = new Set();
      let readBootstrapModules = new Set();
      let commonApplicationModules = new Set();
      let taskApplicationModules = new Set();
      let serverRenderedApplicationModules = new Set();
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.thisCompilation.tap('ProtectPublicApplicationChunks', (compilation) => {
            compilation.hooks.optimizeChunks.tap({ name: 'ProtectPublicApplicationChunks', stage: -100 }, () => {
              const modules = [...compilation.modules];
              const staticClosure = (roots) => {
                const visited = new Set();
                const pending = [...roots];
                while (pending.length) {
                  const webpackModule = pending.pop();
                  if (visited.has(webpackModule)) continue;
                  visited.add(webpackModule);
                  for (const connection of compilation.moduleGraph.getOutgoingConnections(webpackModule)) {
                    const dependency = connection.dependency;
                    // AsyncDependenciesBlock edges (including Web Workers)
                    // belong to separate runtimes, not this static closure.
                    if (!connection.module || !dependency || !webpackModule.dependencies.includes(dependency)) continue;
                    if (dependency.weak || dependency.category === 'worker' || dependency.type?.startsWith('import()')) continue;
                    if (connection.isActive(undefined) === false) continue;
                    pending.push(connection.module);
                  }
                }
                return visited;
              };
              publicEntryModules = staticClosure(modules.filter((module) => {
                const resource = module.nameForCondition?.() || '';
                // These server-rendered application routes intentionally share
                // account/UI dependencies; reading routes remain protected.
                const isApplicationPage = /\/src\/pages\/(?:create|protocol|explore|u)\/index\./.test(resource);
                return (resource.includes('/src/pages/') && !isApplicationPage)
                  || /\/src\/components\/providers\/RegistryProvider\./.test(resource);
              }));
              readBootstrapModules = staticClosure(modules.filter((module) => {
                const resource = module.nameForCondition?.() || '';
                return /\/src\/components\/providers\/(?:PublicCoreProviders|OrganizationReadProviders)\./.test(resource);
              }));
              protectedModules = new Set([...publicEntryModules, ...readBootstrapModules]);
              // Only public application dependencies share this group. The Core
              // wallet closure is intentionally separate: merging it here would
              // make every public reader download wallet code before rendering.
              commonApplicationModules = staticClosure(modules.filter((module) => {
                const resource = module.nameForCondition?.() || '';
                return /\/src\/components\/providers\/OrganizationProviders\./.test(resource);
              }));
              taskApplicationModules = staticClosure(modules.filter((module) => {
                const resource = module.nameForCondition?.() || '';
                // Board-only cards, drag/drop and dialogs stay behind their
                // selected view instead of joining every task page's preload.
                return /\/src\/components\/TaskManager\/TaskWorkspace\./.test(resource)
                  || /\/src\/components\/TaskManager\/views\/list\/ListView\./.test(resource);
              }));
              // A shared navbar or feature helper must not attach the entire
              // task group to a server-rendered non-task route. Leave those
              // modules to the common group or webpack's default splitting.
              serverRenderedApplicationModules = staticClosure(modules.filter((module) => {
                const resource = module.nameForCondition?.() || '';
                return /\/src\/pages\/(?:create|protocol|explore|u)\/index\./.test(resource);
              }));
            });
          });
        },
      });
      // Package-level transport grouping: only the GraphQL cache/
      // query runtime, with no wallet, RPC, UI, or application modules.
      if (process.env.POA_GRAPHQL_CHUNK !== '0') {
        config.optimization.splitChunks.cacheGroups.publicGraphql = {
          name: 'public-graphql',
          chunks: 'all',
          minChunks: 1,
          minSize: 0,
          priority: 30,
          reuseExistingChunk: true,
          enforce: true,
          test(module) {
            const resource = module.nameForCondition?.() || '';
            return module.type?.startsWith('javascript')
              && /\/node_modules\/(?:@apollo\/client|graphql|graphql-tag|@wry\/[^/]+|optimism|zen-observable(?:-ts)?|ts-invariant)\//.test(resource);
          },
        };
      }
      // Preserve the exact existing SVG implementations; combine only these
      // three already-shared families, not all icons or their _app runtime.
      if (process.env.POA_ICON_CHUNK !== '0') {
        config.optimization.splitChunks.cacheGroups.applicationIcons = {
          name: 'application-icons',
          chunks: 'all',
          minChunks: 1,
          minSize: 0,
          priority: 30,
          reuseExistingChunk: true,
          enforce: true,
          test(module) {
            const resource = module.nameForCondition?.() || '';
            return module.type?.startsWith('javascript')
              && /\/node_modules\/react-icons\/(?:fi|pi|fa)\//.test(resource);
          },
        };
      }
      // Public pages keep their existing initial dependencies. Only the extra
      // organization-read bootstrap moves together, before wallet startup.
      config.optimization.splitChunks.cacheGroups.readBootstrap = {
        name: 'organization-read',
        chunks: 'async',
        minChunks: 1,
        minSize: 0,
        priority: 25,
        reuseExistingChunk: true,
        enforce: true,
        test(module) {
          return module.type?.startsWith('javascript')
            && (module.nameForCondition?.() || '').includes('/src/')
            && readBootstrapModules.has(module) && !publicEntryModules.has(module);
        },
      };
      const canShareApplicationModule = (module) => {
        if (protectedModules.has(module) || !module.type?.startsWith('javascript')) return false;
        const resource = module.nameForCondition?.() || '';
        if (!resource) return false;
        // Preserve account-operation, wallet-choice and proving boundaries in
        // both groups; the task group must not broaden these exclusions.
        if (/\/src\/services\/web3\//.test(resource)) return false;
        if (/\/src\/(?:hooks\/useWeb3ServicesRuntime|components\/providers\/Web3ServicesRuntime)\./.test(resource)) return false;
        if (/\/node_modules\/(?:permissionless|@coinbase|@walletconnect|@metamask|@safe-global|@simplewebauthn|@zk-email|snarkjs|circomlibjs)\//.test(resource)) return false;
        return true;
      };
      config.optimization.splitChunks.cacheGroups.applicationShared = {
        name: 'application-shared',
        chunks: 'all',
        minChunks: 2,
        minSize: 0,
        priority: 20,
        reuseExistingChunk: true,
        enforce: true,
        test(module) {
          return commonApplicationModules.has(module) && canShareApplicationModule(module);
        },
      };
      // Active task pages preload their feature alongside public providers. Keep task-only
      // dependencies on that parallel request, off non-task account routes.
      // Disjoint membership plus chunks:all avoids initial/async duplication.
      config.optimization.splitChunks.cacheGroups.taskShared = {
        name: 'task-shared',
        chunks: 'all',
        minChunks: 2,
        minSize: 0,
        priority: 19,
        reuseExistingChunk: true,
        enforce: true,
        test(module) {
          return taskApplicationModules.has(module)
            && !commonApplicationModules.has(module)
            && !serverRenderedApplicationModules.has(module)
            && canShareApplicationModule(module);
        },
      };
    }
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (r) => {
        r.request = r.request.replace(/^node:/, '');
      }),
    );
    config.plugins.push(
      new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: 'process/browser' }),
    );
    config.resolve.fallback = {
      ...config.resolve.fallback,
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      constants: require.resolve('constants-browserify'),
      crypto: require.resolve('crypto-browserify'),
      events: require.resolve('events/'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      path: require.resolve('path-browserify'),
      process: require.resolve('process/browser'),
      querystring: require.resolve('querystring-es3'),
      stream: require.resolve('stream-browserify'),
      url: require.resolve('url/'),
      util: require.resolve('util/'),
      vm: require.resolve('vm-browserify'),
      zlib: require.resolve('browserify-zlib'),
      fs: false,
      net: false,
      tls: false,
      child_process: false,
      readline: false,
      dns: false,
    };
    // MetaMask SDK has an optional React Native storage import. It is never
    // used by this browser-only app, so do not ask webpack to resolve it.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

export default nextConfig;
