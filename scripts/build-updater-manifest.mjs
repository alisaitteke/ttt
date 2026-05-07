/**
 * Builds Tauri's `latest.json` updater manifest by reading every `*.sig` asset
 * already uploaded to a GitHub Release and pairing it with its installer URL.
 *
 * Tauri 2 looks for the following platform keys:
 *   darwin-aarch64, darwin-x86_64, linux-x86_64, windows-x86_64
 *
 * The signature payload is the literal text content of the `.sig` file.
 *
 * Required env:
 * - GH_TOKEN: GitHub token with read access to the release.
 * - REPO: `<owner>/<name>` of the repository.
 * - TAG: Release tag (`v0.2.15`).
 * - VERSION: Bare version (`0.2.15`).
 *
 * Optional env:
 * - NOTES: Release notes string (defaults to empty).
 *
 * Writes the manifest JSON to stdout.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Execute a command with bounded retries for transient GitHub API failures
 * (rate limiting, 5xx). Permanent errors are surfaced after the first attempt.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {number} maxRetries
 * @param {number} delayMs
 * @returns {string}
 */
function execCaptureWithRetry(cmd, args, maxRetries = 3, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status === 0) {
      return r.stdout;
    }
    const stderr = (r.stderr || '').trim();
    lastError = new Error(`${cmd} ${args.join(' ')} failed: ${stderr}`);

    const transient =
      /HTTP 5\d{2}/u.test(stderr) ||
      /rate limit/iu.test(stderr) ||
      /timeout|ECONN|ENOTFOUND|EAI_AGAIN/iu.test(stderr);
    if (!transient || attempt === maxRetries) {
      throw lastError;
    }
    console.warn(`[retry ${attempt}/${maxRetries}] transient gh failure, retrying in ${delayMs}ms: ${stderr}`);
    spawnSync('sleep', [String(delayMs / 1000)], { stdio: 'inherit' });
  }
  throw lastError;
}

/**
 * @param {string} cmd
 * @param {string[]} args
 */
function execInherit(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
  }
}

/**
 * Each entry maps a Tauri updater platform key to the regular expression that
 * picks the matching installer asset from the release. Keep these patterns
 * tight so we never accidentally pair a `.dmg` signature with a `.app.tar.gz`
 * binary, etc.
 *
 * @type {Array<{ platform: string; sigPattern: RegExp; binaryFor: (sig: string) => string }>}
 */
const PLATFORM_TARGETS = [
  {
    platform: 'darwin-aarch64',
    sigPattern: /aarch64\.app\.tar\.gz\.sig$/u,
    binaryFor: (sig) => sig.replace(/\.sig$/u, ''),
  },
  {
    platform: 'darwin-x86_64',
    sigPattern: /x64\.app\.tar\.gz\.sig$/u,
    binaryFor: (sig) => sig.replace(/\.sig$/u, ''),
  },
  {
    platform: 'linux-x86_64',
    sigPattern: /\.AppImage\.sig$/u,
    binaryFor: (sig) => sig.replace(/\.sig$/u, ''),
  },
  {
    platform: 'windows-x86_64',
    sigPattern: /(?:nsis\.zip|setup\.nsis\.zip)\.sig$/u,
    binaryFor: (sig) => sig.replace(/\.sig$/u, ''),
  },
];

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing required env: ${name}`);
  }
  return v;
}

function main() {
  const repo = requireEnv('REPO');
  const tag = requireEnv('TAG');
  const version = requireEnv('VERSION');
  const notes = process.env.NOTES?.trim() ?? '';

  // `gh release view` works for draft and published releases alike (it
  // proxies through `gh`'s own listing logic). The REST endpoint
  // `/repos/{repo}/releases/tags/{tag}` only returns *published* releases
  // and 404s on drafts, which is the state the asset upload jobs leave
  // the release in until `publish-release` flips it to public.
  console.log(`[build-updater-manifest] Fetching release ${tag} from ${repo}...`);
  const raw = execCaptureWithRetry('gh', [
    'release',
    'view',
    tag,
    '--repo',
    repo,
    '--json',
    'assets',
  ]);
  const release = JSON.parse(raw);
  /** @type {Array<{ name: string; url: string }>} */
  const assets = release.assets ?? [];
  console.log(`[build-updater-manifest] Found ${assets.length} assets in release.`);

  const tmp = mkdtempSync(join(tmpdir(), 'updater-sigs-'));
  /** @type {Record<string, { signature: string; url: string }>} */
  const platforms = {};

  try {
    for (const target of PLATFORM_TARGETS) {
      const sigAsset = assets.find((a) => target.sigPattern.test(a.name));
      if (!sigAsset) {
        console.warn(`[build-updater-manifest] No signature asset for ${target.platform}; skipping.`);
        continue;
      }
      const binaryName = target.binaryFor(sigAsset.name);
      const binaryAsset = assets.find((a) => a.name === binaryName);
      if (!binaryAsset) {
        console.warn(
          `[build-updater-manifest] Signature ${sigAsset.name} has no matching binary ${binaryName}; skipping.`,
        );
        continue;
      }
      const sigPath = join(tmp, sigAsset.name);
      execInherit('gh', [
        'release',
        'download',
        tag,
        '--repo',
        repo,
        '--pattern',
        sigAsset.name,
        '--dir',
        tmp,
        '--clobber',
      ]);
      const signature = readFileSync(sigPath, 'utf8').trim();
      platforms[target.platform] = {
        signature,
        url: binaryAsset.url,
      };
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('No updater signatures matched any release asset; refusing to write empty manifest.');
  }

  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms,
  };

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

main();
