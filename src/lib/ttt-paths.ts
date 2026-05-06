import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { TTT_REVEAL_PATH_PREFIX } from '@ttt/lib/tool-ui-conventions.js';

const EXPORTS_SUBDIR = 'exports';
const DROPS_SUBDIR = 'drops';
const CONNECTIONS_SUBDIR = 'connections';

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

/** Base directory for connection adapters (WhatsApp auth state, etc.). */
export function getTttConnectionsDir(): string {
  const dir = join(getTttHomeDir(), CONNECTIONS_SUBDIR);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** WhatsApp (Baileys) multi-file auth state directory. */
export function getTttWhatsAppAuthDir(): string {
  const dir = join(getTttConnectionsDir(), 'whatsapp');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/** True if Baileys `creds.json` exists (linked session can be restored after restart). */
export async function hasPersistedWhatsAppAuth(): Promise<boolean> {
  const credsPath = join(getTttHomeDir(), CONNECTIONS_SUBDIR, 'whatsapp', 'creds.json');
  try {
    await access(credsPath);
    return true;
  } catch {
    return false;
  }
}

const WHATSAPP_PREFS_FILENAME = 'preferences.json';

/** Env key for MCP child: user enabled extended read tools in the WhatsApp UI. */
export const TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV = 'TTT_WHATSAPP_EXTENDED_DATA_CONSENT' as const;

export interface WhatsAppPreferences {
  extendedDataTools: boolean;
}

export function getTttWhatsAppPreferencesPath(): string {
  return join(getTttWhatsAppAuthDir(), WHATSAPP_PREFS_FILENAME);
}

export async function readWhatsAppPreferences(): Promise<WhatsAppPreferences> {
  try {
    const raw = await readFile(getTttWhatsAppPreferencesPath(), 'utf8');
    const j = JSON.parse(raw) as Partial<WhatsAppPreferences>;
    return { extendedDataTools: j.extendedDataTools === true };
  } catch {
    return { extendedDataTools: false };
  }
}

export async function writeWhatsAppPreferences(prefs: WhatsAppPreferences): Promise<void> {
  getTttWhatsAppAuthDir();
  await writeFile(
    getTttWhatsAppPreferencesPath(),
    `${JSON.stringify({ extendedDataTools: prefs.extendedDataTools }, null, 2)}\n`,
    { mode: 0o600 }
  );
}

export async function unlinkWhatsAppPreferences(): Promise<void> {
  try {
    await unlink(getTttWhatsAppPreferencesPath());
  } catch {
    /* noop */
  }
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
