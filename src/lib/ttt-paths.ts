import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';

const EXPORTS_SUBDIR = 'exports';
const DROPS_SUBDIR = 'drops';

export function getTttHomeDir(): string {
  const env = process.env.TTT_HOME?.trim();
  if (env) return env;
  return join(homedir(), '.ttt');
}

export function getTttExportsDir(): string {
  const dir = join(getTttHomeDir(), EXPORTS_SUBDIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** Staging directory for browser drag-and-drop (no real disk path in JS). */
export function getTttDropsDir(): string {
  const dir = join(getTttHomeDir(), DROPS_SUBDIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function normalizeExt(ext: string): string {
  const e = ext.replace(/^\.+/, '').toLowerCase();
  return e || 'bin';
}

function assertResolvedUnderExports(exportsDir: string, resolved: string): void {
  const rel = relative(exportsDir, resolved);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Resolved path escapes TTT exports directory');
  }
}

/**
 * Resolve a save/export path: optional user path, default file under ~/.ttt/exports.
 * Absolute paths are kept as-is (normalized). Relative paths must stay inside exports.
 */
export function resolveTttOutputPath(userPath: string | undefined, ext: string): string {
  const exportsDir = getTttExportsDir();
  const dotExt = `.${normalizeExt(ext)}`;

  const trimmed = userPath?.trim();
  if (!trimmed) {
    const base = `ttt-export-${Date.now()}-${randomBytes(4).toString('hex')}${dotExt}`;
    return join(exportsDir, base);
  }

  if (isAbsolute(trimmed)) {
    return normalize(trimmed);
  }

  const resolved = resolve(exportsDir, trimmed);
  assertResolvedUnderExports(exportsDir, resolved);
  return resolved;
}

/**
 * Resolve a read/open path: relative paths are rooted in ~/.ttt/exports.
 * Absolute paths are kept as-is (normalized).
 */
export function resolveTttInputPath(userPath: string): string {
  const trimmed = userPath.trim();
  if (!trimmed) {
    throw new Error('Path is required');
  }

  if (isAbsolute(trimmed)) {
    return normalize(trimmed);
  }

  const exportsDir = getTttExportsDir();
  const resolved = resolve(exportsDir, trimmed);
  assertResolvedUnderExports(exportsDir, resolved);
  return resolved;
}

export function appendRevealPathLine(message: string, absolutePath: string): string {
  const line = `TTT_REVEAL_PATH:${absolutePath}`;
  if (message.includes(line)) return message;
  return `${message}\n${line}`;
}
