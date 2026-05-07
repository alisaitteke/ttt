/**
 * Copies built server bundles and downloadable Node.js runtimes into `src-tauri/bundle-resources/`
 * for Tauri packaging. Run after `npm run build` (see beforeBuildCommand in tauri.conf).
 */

import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const TAURI_ROOT = join(root, 'src-tauri');
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
  const staging = join(TAURI_ROOT, 'bundle-resources', '.staging', file);
  const unpackDir = join(TAURI_ROOT, 'bundle-resources', '.staging', `unpacked-${t}`);
  const outRoot = join(TAURI_ROOT, 'bundle-resources', 'nodejs', t);
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

function syncServerAssets() {
  const serverDir = join(TAURI_ROOT, 'bundle-resources', 'server');
  rmSync(serverDir, { recursive: true, force: true });
  mkdirSync(serverDir, { recursive: true });

  const srcDist = join(root, 'dist');
  const srcWebDist = join(root, 'web', 'dist');
  const srcModules = join(root, 'node_modules');

  if (!existsSync(srcDist)) {
    throw new Error('Missing dist/. Run npm run build first.');
  }
  if (!existsSync(srcWebDist)) {
    throw new Error('Missing web/dist/. Run npm run build first.');
  }
  if (!existsSync(srcModules)) {
    throw new Error('Missing root node_modules/.');
  }

  cpSync(srcDist, join(serverDir, 'dist'), { recursive: true });
  mkdirSync(join(serverDir, 'web'), { recursive: true });
  cpSync(srcWebDist, join(serverDir, 'web', 'dist'), { recursive: true });
  cpSync(srcModules, join(serverDir, 'node_modules'), { recursive: true });
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  console.log(`[tauri-prepare-bundle] Packaging ${pkg.version} with Node.js ${NODE_VERSION}`);

  const targets = argvTargets() ?? defaultTargets();
  mkdirSync(join(TAURI_ROOT, 'bundle-resources'), { recursive: true });

  if (process.env.TAURI_PREPARE_SKIP_NPM_CI === '1') {
    const r = spawnSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (r.status !== 0) {
      throw new Error('npm ci --omit=dev failed (required for reproducible native prebuilds).');
    }
  }

  syncServerAssets();

  for (const t of targets) {
    await ensureNodeRuntime(t);
  }

  console.log('[tauri-prepare-bundle] Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
