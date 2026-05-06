import type { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Mutex } from 'async-mutex';
import { rm } from 'node:fs/promises';
import pino from 'pino';
import { getTttWhatsAppAuthDir } from '../../../lib/ttt-paths.js';
import { Logger } from '../../../utils/logger.js';
import type { ConnectionAdapter, ConnectionPublicInfo, WhatsAppStreamEvent } from '../../types.js';

const silentLogger = pino({ level: 'silent' });

function jidFromPhoneDigits(to: string): string {
  const digits = to.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid `to`: expected digits (international format, no +).');
  }
  return `${digits}@s.whatsapp.net`;
}

function assertPublicHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Invalid `imageUrl`: expected a valid http(s) URL.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('`imageUrl` must use http or https.');
  }
  return parsed.toString();
}

function requireLinkedSock(sock: WASocket | null, opened: boolean): asserts sock is WASocket {
  if (!sock || !opened) {
    throw new Error(
      'WhatsApp is not connected. Open TTT UI → Settings → Messaging and link your device.'
    );
  }
}

export class WhatsAppConnectionAdapter implements ConnectionAdapter {
  readonly id = 'whatsapp' as const;
  readonly displayName = 'WhatsApp';

  private logger = new Logger('WhatsAppAdapter');
  private mutex = new Mutex();
  private sock: WASocket | null = null;
  private latestQr: string | null = null;
  private opened = false;
  private listeners = new Set<(ev: WhatsAppStreamEvent) => void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private emit(ev: WhatsAppStreamEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(ev);
      } catch (e) {
        this.logger.warn('stream listener error', e);
      }
    }
  }

  subscribe(listener: (ev: WhatsAppStreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getLatestQrRaw(): string | null {
    return this.latestQr;
  }

  async getPublicInfo(): Promise<ConnectionPublicInfo> {
    const u = this.sock?.user;
    const sessionHint =
      u && typeof (u as { id?: string }).id === 'string'
        ? (u as { id: string }).id
        : undefined;
    return {
      id: 'whatsapp',
      displayName: this.displayName,
      connected: this.opened,
      sessionHint,
    };
  }

  async ensureSocket(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.startSocketLocked();
    });
  }

  async disconnect(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.clearReconnectTimer();
      this.teardownSocket();
      this.opened = false;
      this.latestQr = null;
    });
  }

  async logout(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.clearReconnectTimer();
      this.teardownSocket();
      this.opened = false;
      this.latestQr = null;
      try {
        await rm(getTttWhatsAppAuthDir(), { recursive: true, force: true });
      } catch (e) {
        this.logger.warn('logout rm auth dir', e);
      }
      getTttWhatsAppAuthDir();
    });
  }

  async invokeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    switch (toolName) {
      case 'whatsapp_status': {
        const info = await this.getPublicInfo();
        return JSON.stringify(
          {
            connected: info.connected,
            sessionHint: info.sessionHint ?? null,
          },
          null,
          2
        );
      }
      case 'whatsapp_check_recipient': {
        const to = typeof args.to === 'string' ? args.to : '';
        requireLinkedSock(this.sock, this.opened);
        const jid = jidFromPhoneDigits(to);
        const rows = await this.sock.onWhatsApp(jid);
        return JSON.stringify(
          {
            queriedJid: jid,
            results: rows ?? null,
          },
          null,
          2
        );
      }
      case 'whatsapp_send_message': {
        const to = typeof args.to === 'string' ? args.to : '';
        const text = typeof args.text === 'string' ? args.text : '';
        if (!text.trim()) {
          throw new Error('Missing non-empty `text`.');
        }
        requireLinkedSock(this.sock, this.opened);
        const jid = jidFromPhoneDigits(to);
        await this.sock.sendMessage(jid, { text });
        return JSON.stringify({ ok: true, to: jid }, null, 2);
      }
      case 'whatsapp_send_image': {
        const to = typeof args.to === 'string' ? args.to : '';
        const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
        const caption =
          typeof args.caption === 'string' && args.caption.trim() ? args.caption.trim() : undefined;
        if (!imageUrl.trim()) {
          throw new Error('Missing `imageUrl`.');
        }
        const url = assertPublicHttpUrl(imageUrl);
        requireLinkedSock(this.sock, this.opened);
        const jid = jidFromPhoneDigits(to);
        await this.sock.sendMessage(jid, {
          image: { url },
          ...(caption ? { caption } : {}),
        });
        return JSON.stringify({ ok: true, to: jid }, null, 2);
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch {
        /* ignore */
      }
      this.sock = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSocket().catch((e) => this.logger.warn('reconnect failed', e));
    }, 2_000);
  }

  private async startSocketLocked(): Promise<void> {
    if (this.sock) {
      if (this.opened) return;
      return;
    }

    this.teardownSocket();
    this.latestQr = null;

    const authDir = getTttWhatsAppAuthDir();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const verInfo = await fetchLatestWaWebVersion({ timeout: 20_000 });
    if (verInfo.error) {
      this.logger.warn('fetchLatestWaWebVersion failed; using bundled WA version', verInfo.error);
    }

    const sock = makeWASocket({
      auth: state,
      version: verInfo.version,
      printQRInTerminal: false,
      logger: silentLogger,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.latestQr = qr;
        this.emit({ type: 'qr', raw: qr });
      }

      if (connection === 'open') {
        this.opened = true;
        this.latestQr = null;
        this.emit({ type: 'connected' });
      }

      if (connection === 'close') {
        this.opened = false;
        const boom = lastDisconnect?.error as Boom | undefined;
        const code = boom?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const reason = boom?.message ?? String(lastDisconnect?.error ?? 'closed');
        const statusCode = typeof code === 'number' ? code : undefined;
        this.emit({ type: 'disconnected', reason, statusCode });

        this.teardownSocket();

        const noReconnect =
          loggedOut ||
          code === 405 ||
          code === 419 ||
          code === DisconnectReason.forbidden ||
          code === DisconnectReason.multideviceMismatch ||
          code === DisconnectReason.badSession;

        if (!noReconnect) {
          this.scheduleReconnect();
        }
        if (noReconnect) {
          this.latestQr = null;
        }
      }
    });
  }
}
