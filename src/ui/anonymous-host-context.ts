import * as os from 'node:os';

export const MAX_IANA_TIMEZONE_LEN = 64;

/**
 * Validates a client-reported IANA timezone id (e.g. Europe/Istanbul).
 * Keeps payload small and avoids odd characters.
 */
export function normalizeClientIanaTimezone(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const t = input.trim();
  if (t.length < 2 || t.length > MAX_IANA_TIMEZONE_LEN) return undefined;
  if (!/^[A-Za-z0-9/_+-]+$/.test(t)) return undefined;
  return t;
}

/**
 * JavaScript `Date#getTimezoneOffset`: minutes to add to local time to get UTC
 * (e.g. US Pacific often 300 in standard time).
 */
export function normalizeJsTimezoneOffsetMinutes(input: unknown): number | undefined {
  if (typeof input !== 'number' || !Number.isFinite(input)) return undefined;
  const n = Math.trunc(input);
  if (n < -840 || n > 840) return undefined;
  return n;
}

/** Same instant as \`Date#toISOString()\` from a trusted-ish client (no millisecond laxity). */
export function normalizeClientNowUtcIso(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (s.length < 20 || s.length > 35) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/i.test(s)) return undefined;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return undefined;
  return s.endsWith('z') ? `${s.slice(0, -1)}Z` : s;
}

/**
 * Local civil wall-clock snapshot in \`clientReportedIanaTimezone\`, formatted as \`YYYY-MM-DD HH:mm:ss\`.
 */
export function normalizeClientLocalWallClock(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}([ T])\d{2}:\d{2}:\d{2}$/.test(s)) return undefined;
  const normalized = s.replace('T', ' ');
  if (normalized.length !== 19) return undefined;
  return normalized;
}

export interface AnonymousHostContextOptions {
  clientIanaTimezone?: string;
  /** JS convention: minutes to add to local time to obtain UTC. */
  clientTimezoneOffsetMinutes?: number;
  clientNowUtcIso?: string;
  /** Local civil time in \`clientIanaTimezone\` for the same instant as the UTC fields. */
  clientLocalWallClockInIanaZone?: string;
}

/**
 * Facts about the machine running the TTT UI server (typically the user's workstation).
 * No hostname, username, MAC, IP, or home path — only coarse OS/runtime signals useful for tooling advice.
 */
export function collectAnonymousHostContext(
  opts: AnonymousHostContextOptions = {}
): Record<string, unknown> {
  const cpus = os.cpus();
  const totalGiB = Math.max(0, Math.floor(os.totalmem() / 1024 ** 3));
  const freeGiB = Math.max(0, Math.floor(os.freemem() / 1024 ** 3));

  const ctx: Record<string, unknown> = {
    schemaVersion: 1,
    nodePlatform: process.platform,
    osType: os.type(),
    kernelRelease: os.release(),
    architecture: os.arch(),
    endianness: os.endianness(),
    logicalCpuCount: cpus.length > 0 ? cpus.length : null,
    approxTotalMemoryGiB: totalGiB,
    approxFreeMemoryGiB: freeGiB,
    nodeRuntimeVersion: process.versions.node,
    tttServerUtcIso: new Date().toISOString(),
  };

  if (opts.clientIanaTimezone !== undefined) {
    ctx.clientReportedIanaTimezone = opts.clientIanaTimezone;
  }
  if (opts.clientTimezoneOffsetMinutes !== undefined) {
    ctx.clientReportedTimezoneOffsetMinutes = opts.clientTimezoneOffsetMinutes;
  }

  if (opts.clientNowUtcIso !== undefined) {
    ctx.clientNowUtcIsoFromBrowser = opts.clientNowUtcIso;
  }
  if (opts.clientLocalWallClockInIanaZone !== undefined) {
    ctx.clientLocalWallClockInIanaTimezone = opts.clientLocalWallClockInIanaZone;
  }

  if (
    opts.clientIanaTimezone !== undefined ||
    opts.clientTimezoneOffsetMinutes !== undefined ||
    opts.clientNowUtcIso !== undefined ||
    opts.clientLocalWallClockInIanaZone !== undefined
  ) {
    ctx.modelTimeGuidance =
      'For user questions about current time or date: if clientLocalWallClockInIanaTimezone is present, use it as the local civil date-time in clientReportedIanaTimezone; it matches the same instant as tttServerUtcIso and clientNowUtcIsoFromBrowser. Answer in one plain sentence. Do not spell place or zone names letter-by-letter, stack characters vertically, or add decorative symbols or emojis. JavaScript Date#getTimezoneOffset() is in minutes: negative when local civil time is ahead of UTC, positive when local is behind UTC.';
  }

  return ctx;
}
