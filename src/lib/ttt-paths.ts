import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { TTT_REVEAL_PATH_PREFIX } from './tool-ui-conventions.js';

const EXPORTS_SUBDIR = 'exports';
const DROPS_SUBDIR = 'drops';

/** Set by the UI chat runner so default exports land under ~/.ttt/exports/<id>/. */
export const TTT_EXPORT_CHAT_ID_ENV = 'TTT_EXPORT_CHAT_ID';

/**
 * Returns a single path segment for ~/.ttt/exports/<segment>/ or null if unset/unsafe.
 * Only [A-Za-z0-9_-] allowed (UUIDs from the UI qualify).
 */
export function sanitizeExportChatSegment(raw: string | undefined | null): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(t)) return null;
  if (t === '.' || t === '..') return null;
  return t;
}

export function getTttHomeDir(): string {
  const env = process.env.TTT_HOME?.trim();
  if (env) return env;
  return join(homedir(), '.ttt');
}

/** Parent directory ~/.ttt/exports (all chat buckets live under this). */
export function getTttExportsDir(): string {
  const dir = join(getTttHomeDir(), EXPORTS_SUBDIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Directory used for relative export/input paths: ~/.ttt/exports or
 * ~/.ttt/exports/<chatId> when {@link TTT_EXPORT_CHAT_ID_ENV} is set to a safe segment.
 */
export function getTttExportsWorkingDir(): string {
  const root = getTttExportsDir();
  const seg = sanitizeExportChatSegment(process.env[TTT_EXPORT_CHAT_ID_ENV]);
  if (!seg) return root;
  const dir = join(root, seg);
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
 * Resolve a save/export path: optional user path, default file under the active exports
 * working directory (~/.ttt/exports or ~/.ttt/exports/<chatId>).
 * Absolute paths are kept as-is (normalized). Relative paths must stay inside that directory.
 */
export function resolveTttOutputPath(userPath: string | undefined, ext: string): string {
  const exportsDir = getTttExportsWorkingDir();
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
 * Resolve a read/open path: relative paths are rooted in the active exports working directory.
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

  const exportsDir = getTttExportsWorkingDir();
  const resolved = resolve(exportsDir, trimmed);
  assertResolvedUnderExports(exportsDir, resolved);
  return resolved;
}

export function appendRevealPathLine(message: string, absolutePath: string): string {
  const line = `${TTT_REVEAL_PATH_PREFIX}${absolutePath}`;
  if (message.includes(line)) return message;
  return `${message}\n${line}`;
}
