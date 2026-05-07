/**
 * Bundles the Node UI server into a single ESM file for the Tauri desktop shell.
 *
 * Output: `dist-bundle/server.mjs` plus a minimal `package.json` listing the
 * native/runtime modules left external. `scripts/tauri-prepare-bundle.mjs`
 * stages this bundle plus a fresh `npm install --omit=dev` of those externals
 * into `src-tauri/bundle-resources/server/`.
 */

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const OUT_DIR = join(root, 'dist-bundle');
const OUT_FILE = join(OUT_DIR, 'server.mjs');

/**
 * Modules left external in the bundle. Either:
 *   - native (`.node`) bindings that cannot be bundled, or
 *   - dynamic-require / worker-thread heavy packages whose internal `require`
 *     calls esbuild cannot statically resolve safely.
 *
 * Order matches `EXTERNAL_RUNTIME_DEPS` below so the staged `package.json`
 * lists exactly what gets installed at runtime.
 */
const EXTERNALS = [
  'better-sqlite3',
  '@whiskeysockets/baileys',
  'sharp',
  'pino',
  'pino-pretty',
  'thread-stream',
  // Docker MCP pulls in `dockerode` -> `ssh2` -> `cpu-features` (native bindings),
  // and the package itself is small enough that bundling it doesn't help much.
  '@alisaitteke/docker-mcp',
  'ssh2',
  'cpu-features',
];

/**
 * Subset of root `dependencies` that must be installed at runtime alongside
 * the bundle. Versions are sourced from the root `package.json` so they stay
 * in sync with what we develop against.
 */
const EXTERNAL_RUNTIME_DEPS = [
  'better-sqlite3',
  '@whiskeysockets/baileys',
  'pino',
  '@alisaitteke/docker-mcp',
];

function readRootPkg() {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

function writeBundleManifest(pkg) {
  const deps = {};
  for (const name of EXTERNAL_RUNTIME_DEPS) {
    const version = pkg.dependencies?.[name];
    if (!version) {
      throw new Error(`External '${name}' not found in root package.json dependencies`);
    }
    deps[name] = version;
  }
  const bundlePkg = {
    name: `${pkg.name}-bundle`,
    version: pkg.version,
    private: true,
    type: 'module',
    main: 'server.mjs',
    dependencies: deps,
  };
  writeFileSync(join(OUT_DIR, 'package.json'), `${JSON.stringify(bundlePkg, null, 2)}\n`);
}

async function main() {
  const pkg = readRootPkg();

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  await build({
    entryPoints: [join(root, 'src', 'index.ts')],
    outfile: OUT_FILE,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    logLevel: 'info',
    external: EXTERNALS,
    define: {
      __TTT_BUNDLED__: 'true',
      __TTT_PKG_VERSION__: JSON.stringify(pkg.version),
    },
    // Some bundled CJS deps reach for `require` at runtime; provide one in the ESM output.
    banner: {
      js: [
        "import { createRequire as __ttt_createRequire } from 'node:module';",
        'const require = __ttt_createRequire(import.meta.url);',
      ].join('\n'),
    },
    tsconfig: join(root, 'tsconfig.json'),
  });

  writeBundleManifest(pkg);

  console.log(`[build-server-bundle] Wrote ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
