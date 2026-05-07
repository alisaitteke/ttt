/**
 * Re-signs every Mach-O binary nested inside `src-tauri/bundle-resources/` with
 * a Developer ID Application identity, hardened runtime, and a secure
 * timestamp.
 *
 * Apple's notary service rejects nested `.node`, `.dylib`, and standalone
 * executables when they only carry an inherited `--deep` signature, so we
 * pre-sign them here before Tauri's outer bundling step takes over.
 *
 * Required env:
 * - APPLE_SIGNING_IDENTITY: Developer ID Application "<Name> (TEAMID)" or hash.
 *
 * Optional env:
 * - APPLE_ENTITLEMENTS: Path to entitlements plist; defaults to
 *   `src-tauri/entitlements.plist` if it exists.
 * - APPLE_SIGNING_KEYCHAIN: Keychain to source the identity from (forwarded
 *   to `codesign --keychain`).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('.', import.meta.url)));
const TARGET_ROOT = join(root, 'src-tauri', 'bundle-resources');
const DEFAULT_ENTITLEMENTS = join(root, 'src-tauri', 'entitlements.plist');

/** Mach-O / FAT magic numbers in the order they appear in the file header. */
const MACH_O_MAGICS = [
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]),
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]),
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]),
  Buffer.from([0xbe, 0xba, 0xfe, 0xca]),
];

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isMachO(filePath) {
  let fd = -1;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(4);
    const bytesRead = readSync(fd, head, 0, 4, 0);
    if (bytesRead < 4) {
      return false;
    }
    return MACH_O_MAGICS.some((magic) => head.equals(magic));
  } catch {
    return false;
  } finally {
    if (fd !== -1) {
      closeSync(fd);
    }
  }
}

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * @param {string} filePath
 * @param {string} identity
 * @param {string | null} entitlements
 * @param {string | null} keychain
 */
function codesignFile(filePath, identity, entitlements, keychain) {
  /** @type {string[]} */
  const args = [
    '--force',
    '--options',
    'runtime',
    '--timestamp',
    '--sign',
    identity,
  ];
  if (keychain) {
    args.push('--keychain', keychain);
  }
  if (entitlements) {
    args.push('--entitlements', entitlements);
  }
  args.push(filePath);

  const res = spawnSync('codesign', args, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`codesign failed (${res.status}) for ${filePath}`);
  }
}

/**
 * @param {string} filePath
 */
function verifySignature(filePath) {
  const res = spawnSync('codesign', ['--verify', '--strict', '--verbose=2', filePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (res.status !== 0) {
    const stderr = (res.stderr || '').trim();
    throw new Error(`codesign --verify failed for ${filePath}: ${stderr}`);
  }
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('[macos-codesign-resources] Skipping: not running on macOS.');
    return;
  }

  const identity = process.env.APPLE_SIGNING_IDENTITY?.trim();
  if (!identity) {
    throw new Error(
      '[macos-codesign-resources] APPLE_SIGNING_IDENTITY is required (Developer ID Application name or SHA-1).',
    );
  }

  if (!existsSync(TARGET_ROOT)) {
    throw new Error(
      `[macos-codesign-resources] Missing ${TARGET_ROOT}. Run tauri-prepare-bundle.mjs first.`,
    );
  }

  const entitlementsEnv = process.env.APPLE_ENTITLEMENTS?.trim();
  let entitlements = entitlementsEnv || null;
  if (!entitlements && existsSync(DEFAULT_ENTITLEMENTS)) {
    entitlements = DEFAULT_ENTITLEMENTS;
  }
  if (entitlements && !existsSync(entitlements)) {
    throw new Error(`[macos-codesign-resources] Entitlements file not found: ${entitlements}`);
  }

  const keychain = process.env.APPLE_SIGNING_KEYCHAIN?.trim() || null;

  console.log(`[macos-codesign-resources] Identity: ${identity}`);
  if (entitlements) {
    console.log(`[macos-codesign-resources] Entitlements: ${entitlements}`);
  }
  if (keychain) {
    console.log(`[macos-codesign-resources] Keychain: ${keychain}`);
  }

  /** @type {string[]} */
  const signed = [];
  let scanned = 0;

  for await (const file of walkFiles(TARGET_ROOT)) {
    scanned += 1;
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (stat.size < 4) {
      continue;
    }
    if (!isMachO(file)) {
      continue;
    }
    codesignFile(file, identity, entitlements, keychain);
    verifySignature(file);
    signed.push(file);
  }

  console.log(
    `[macos-codesign-resources] Scanned ${scanned} files, signed ${signed.length} Mach-O binaries.`,
  );
  for (const file of signed) {
    console.log(`  signed: ${file.slice(root.length + 1)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
