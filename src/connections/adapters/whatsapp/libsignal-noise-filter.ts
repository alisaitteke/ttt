import { Logger } from '@ttt/utils/logger.js';

/**
 * `libsignal` (used by Baileys for WhatsApp E2E crypto) hardcodes `console.*`
 * calls in several places — bypassing Baileys' silent pino logger and printing
 * directly to stderr/stdout. These messages are operational noise (out-of-order
 * backlog, expired prekey, already-acked counter, session rotation) but
 * `session_record.js` also dumps the entire `SessionEntry` object — which
 * contains private ratchet keys, root keys and chain keys. Leaking those into
 * application logs is a hard security violation.
 *
 * We intercept the well-known patterns from libsignal and re-emit only the
 * leading message string at DEBUG. Trailing arguments (which may carry the
 * `SessionEntry` with private key material) are dropped on purpose. Every
 * other `console.*` call is forwarded untouched.
 *
 * The patch is process-global and idempotent so multiple adapter instances or
 * restarts share a single hook.
 */

const NOISE_PATTERNS = [
  // session_cipher.js — decryptWithSessions failure spam
  'Failed to decrypt message with any known session',
  'Session error:',
  'Bad MAC',
  'MessageCounterError',
  'Key used already or never filled',
  'Chain closed',
  'Over 2000 messages into the future',
  // session_builder.js / session_record.js — normal session rotation
  'Closing open session in favor of incoming prekey bundle',
  'Closing session:',
  'Decrypted message with closed session',
] as const;

type ConsoleMethod = 'error' | 'warn' | 'info' | 'log';

const PATCHED_METHODS: readonly ConsoleMethod[] = ['error', 'warn', 'info', 'log'];

let installed = false;

function isLibsignalNoise(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first !== 'string') return false;
  for (const p of NOISE_PATTERNS) {
    if (first.includes(p)) return true;
  }
  return false;
}

/**
 * Installs the libsignal noise filter exactly once per process. Safe to call
 * from multiple entry points; subsequent calls are no-ops.
 */
export function installLibsignalNoiseFilter(): void {
  if (installed) return;
  installed = true;

  const logger = new Logger('WhatsAppLibsignal');

  for (const method of PATCHED_METHODS) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      if (isLibsignalNoise(args)) {
        // Drop trailing args on purpose: libsignal sometimes passes the raw
        // SessionEntry which contains private ratchet/chain/root keys.
        logger.debug(`libsignal noise (${method}, suppressed)`, args[0]);
        return;
      }
      original(...(args as Parameters<typeof console.error>));
    };
  }
}
