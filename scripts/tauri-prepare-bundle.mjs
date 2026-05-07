/**
 * Stages the desktop sidecar payload into `src-tauri/bundle-resources/`:
 *
 *   bundle-resources/
 *   ├── server/
 *   │   ├── server.mjs        (esbuild bundle of src/index.ts)
 *   │   ├── package.json      (lists native/external runtime deps only)
 *   │   ├── node_modules/     (npm install --omit=dev of those externals)
 *   │   └── web/dist/         (Vite SPA)
 *   └── nodejs/<target>/node  (downloaded official Node.js binary)
 *
 * Run after `npm run build && npm run build:server:bundle`
 * (see `beforeBuildCommand` in `tauri.conf.json`).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const TAURI_ROOT = join(root, 'src-tauri');
const BUNDLE_RESOURCES = join(TAURI_ROOT, 'bundle-resources');
const SERVER_OUT = join(BUNDLE_RESOURCES, 'server');
const STAGING = join(BUNDLE_RESOURCES, '.staging');
const BUNDLE_DIR = join(root, 'dist-bundle');

/** Must match bundled Node majors used to resolve native prebuilds. */
const NODE_VERSION = process.env.NODE_VERSION_FOR_DESKTOP ?? '22.14.0';
const DIST_BASE = (process.env.NODEJS_ORG_MIRROR ?? 'https://nodejs.org/dist').replace(/\/?$/u, '');

/** @typedef {'darwin-arm64' | 'darwin-x64' | 'linux-x64' | 'win-x64'} BundleTarget */

function argvTargets() {
  const i = process.argv.indexOf('--targets');
  if (i !== -1 && process.argv[i + 1]) {
    return /** @type {BundleTarget[]} */ (
      process.argv[i + 1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  const env = process.env.TAURI_BUNDLE_TARGETS;
  if (env) {
    return /** @type {BundleTarget[]} */ (
      env
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  return null;
}

/** @returns {BundleTarget[]} */
function defaultTargets() {
  if (process.platform === 'darwin') {
    return [process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'];
  }
  if (process.platform === 'linux') {
    return ['linux-x64'];
  }
  if (process.platform === 'win32') {
    return ['win-x64'];
  }
  throw new Error(`Unsupported host OS for desktop bundle staging: ${process.platform}`);
}

/**
 * Tar on Windows GitHub-hosted runners responds to `-xzf` for `.tar.gz` and `-xf` for `.zip`.
 *
 * @param {string} archivePath
 * @param {string} outDir
 */
function extractArchive(archivePath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const tarBin = process.platform === 'win32' ? 'tar.exe' : 'tar';
  const ext = archivePath.toLowerCase();
  /** @type {string[]} */
  const args =
    ext.endsWith('.zip') ? ['-xf', archivePath, '-C', outDir] : ['-xzf', archivePath, '-C', outDir];
  const r = spawnSync(tarBin, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`Failed extracting ${basename(archivePath)}`);
  }
}

/**
 * @param {string} urlStr
 * @param {string} dest
 */
async function fetchToFile(urlStr, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const mod = urlStr.startsWith('https') ? await import('node:https') : await import('node:http');
  const { createWriteStream } = await import('node:fs');
  await new Promise((resolve, reject) => {
    const destStream = createWriteStream(dest);
    const req = mod.get(urlStr, (res) => {
      const code = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        void fetchToFile(new URL(res.headers.location, urlStr).toString(), dest).then(resolve, reject);
        return;
      }
      if (code !== 200) {
        reject(new Error(`GET ${urlStr} -> ${code}`));
        res.resume();
        return;
      }
      const body = res;
      body.pipe(destStream);
      body.on('error', reject);
      destStream.on('finish', resolve);
    });
    req.on('error', reject);
    destStream.on('error', reject);
  });
}

/**
 * @param {BundleTarget} t
 */
function nodeArchiveMeta(t) {
  switch (t) {
    case 'darwin-arm64':
      return {
        file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
        subdir: `node-v${NODE_VERSION}-darwin-arm64`,
      };
    case 'darwin-x64':
      return {
        file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
        subdir: `node-v${NODE_VERSION}-darwin-x64`,
      };
    case 'linux-x64':
      return {
        file: `node-v${NODE_VERSION}-linux-x64.tar.gz`,
        subdir: `node-v${NODE_VERSION}-linux-x64`,
      };
    case 'win-x64':
      return {
        file: `node-v${NODE_VERSION}-win-x64.zip`,
        subdir: `node-v${NODE_VERSION}-win-x64`,
      };
    default:
      throw new Error(`Unknown Node bundle target: ${t}`);
  }
}

/**
 * @param {BundleTarget} t
 */
async function ensureNodeRuntime(t) {
  const { file, subdir } = nodeArchiveMeta(t);
  const url = `${DIST_BASE}/v${NODE_VERSION}/${file}`;
  const staging = join(STAGING, file);
  const unpackDir = join(STAGING, `unpacked-${t}`);
  const outRoot = join(BUNDLE_RESOURCES, 'nodejs', t);
  const binName = t === 'win-x64' ? 'node.exe' : 'node';
  const finalNode = join(outRoot, binName);

  if (existsSync(finalNode)) {
    return;
  }

  console.log(`[tauri-prepare-bundle] Node ${NODE_VERSION} for ${t}…`);
  await fetchToFile(url, staging);

  rmSync(unpackDir, { recursive: true, force: true });
  mkdirSync(dirname(unpackDir), { recursive: true });
  extractArchive(staging, unpackDir);

  const unpackedRoot = join(unpackDir, subdir);
  const srcBin = t === 'win-x64'
    ? join(unpackedRoot, binName)
    : join(unpackedRoot, 'bin', binName);
  if (!existsSync(srcBin)) {
    throw new Error(`Expected Node binary missing: ${srcBin}`);
  }

  rmSync(outRoot, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  cpSync(srcBin, finalNode);
  if (t !== 'win-x64') {
    try {
      chmodSync(finalNode, 0o755);
    } catch {
      /* ignore */
    }
  }

  rmSync(staging, { force: true });
  rmSync(unpackDir, { recursive: true, force: true });
}

function stageServerPayload() {
  const bundleEntry = join(BUNDLE_DIR, 'server.mjs');
  const bundlePkg = join(BUNDLE_DIR, 'package.json');
  const webDist = join(root, 'web', 'dist');

  if (!existsSync(bundleEntry) || !existsSync(bundlePkg)) {
    throw new Error('Missing dist-bundle/. Run `npm run build:server:bundle` first.');
  }
  if (!existsSync(webDist)) {
    throw new Error('Missing web/dist/. Run `npm run build:web` first.');
  }

  rmSync(SERVER_OUT, { recursive: true, force: true });
  mkdirSync(SERVER_OUT, { recursive: true });

  cpSync(bundleEntry, join(SERVER_OUT, 'server.mjs'));
  cpSync(bundlePkg, join(SERVER_OUT, 'package.json'));
  cpSync(webDist, join(SERVER_OUT, 'web', 'dist'), { recursive: true });

  // Native modules and other non-bundlable runtime deps need to be installed
  // fresh against the staged `package.json` so prebuilds match the host OS/arch
  // of the eventual desktop binary.
  console.log('[tauri-prepare-bundle] Installing runtime externals…');
  const r = spawnSync(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts=false'],
    {
      cwd: SERVER_OUT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    }
  );
  if (r.status !== 0) {
    throw new Error('npm install of staged externals failed.');
  }

  // `npm install` writes its own lockfile; not needed in the shipped bundle.
  rmSync(join(SERVER_OUT, 'package-lock.json'), { force: true });
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  console.log(`[tauri-prepare-bundle] Packaging ${pkg.version} with Node.js ${NODE_VERSION}`);

  const targets = argvTargets() ?? defaultTargets();
  mkdirSync(BUNDLE_RESOURCES, { recursive: true });
  mkdirSync(STAGING, { recursive: true });

  stageServerPayload();

  for (const t of targets) {
    await ensureNodeRuntime(t);
  }

  rmSync(STAGING, { recursive: true, force: true });
  console.log('[tauri-prepare-bundle] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
