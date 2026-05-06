import type { Boom } from '@hapi/boom';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  getContentType,
  normalizeMessageContent,
  useMultiFileAuthState,
  type Chat,
  type ChatUpdate,
  type Contact,
  type WAMessage,
  type WASocket,
} from '@whiskeysockets/baileys';
import { Mutex } from 'async-mutex';
import { rm } from 'node:fs/promises';
import { platform as hostPlatform } from 'node:os';
import pino from 'pino';
import {
  getTttWhatsAppAuthDir,
  readWhatsAppPreferences,
} from '@ttt/lib/ttt-paths.js';
import { Logger } from '@ttt/utils/logger.js';
import type { ConnectionAdapter, ConnectionPublicInfo, WhatsAppStreamEvent } from '@ttt/connections/types.js';

const silentLogger = pino({ level: 'silent' });

const EXTENDED_WHATSAPP_TOOLS = new Set([
  'whatsapp_list_chats',
  'whatsapp_fetch_messages',
  'whatsapp_search_contacts',
]);

const MAX_CHATS_CACHED = 500;
const MAX_MSGS_PER_CHAT = 80;

function jidFromPhoneDigits(to: string): string {
  const digits = to.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid `to`: expected digits (international format, no +).');
  }
  return `${digits}@s.whatsapp.net`;
}

function resolveChatJid(raw: string): string {
  const t = raw.trim();
  if (t.includes('@')) return t;
  return jidFromPhoneDigits(t);
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

/**
 * WhatsApp renders looping GIF-style messages when Baileys sends `video` + `gifPlayback: true`
 * (see WA `videoMessage.gifPlayback`). Sending the same asset as `image` shows a static picture
 * — including .webp previews. Use an .mp4 (e.g. Giphy `mp4_url`) or .gif URL for animation.
 */
function shouldSendUrlAsWhatsAppGifPlayback(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const path = u.pathname.toLowerCase();
    if (path.endsWith('.mp4')) return true;
    if (path.endsWith('.gif')) return true;
    return false;
  } catch {
    return false;
  }
}

function requireLinkedSock(sock: WASocket | null, opened: boolean): asserts sock is WASocket {
  if (!sock || !opened) {
    throw new Error(
      'WhatsApp is not connected. Open TTT UI → Settings → Messaging and link your device.'
    );
  }
}

function chatRowId(c: Chat): string | undefined {
  const id = (c as { id?: string }).id;
  return typeof id === 'string' && id ? id : undefined;
}

function tsNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    const fn = (v as { toNumber?: () => number }).toNumber;
    if (typeof fn === 'function') {
      try {
        return fn.call(v);
      } catch {
        return 0;
      }
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function assertExtendedDataConsent(): Promise<void> {
  const p = await readWhatsAppPreferences();
  if (!p.extendedDataTools) {
    throw new Error(
      'Extended WhatsApp data tools are disabled. Open TTT UI → Settings → Messaging → WhatsApp, enable “Allow AI to read chats & contacts”, save, then try again.'
    );
  }
}

function summarizeWaMessage(m: WAMessage): Record<string, unknown> {
  const norm = normalizeMessageContent(m.message);
  const type = getContentType(norm || undefined) ?? 'unknown';
  let text: string | undefined;
  if (norm?.conversation) text = String(norm.conversation);
  else if (norm?.extendedTextMessage?.text) text = String(norm.extendedTextMessage.text);
  else if (norm?.imageMessage?.caption) text = String(norm.imageMessage.caption);
  const ts = m.messageTimestamp != null ? tsNum(m.messageTimestamp) : null;
  return {
    id: m.key.id,
    fromMe: m.key.fromMe ?? false,
    timestamp: ts,
    type: String(type),
    text: text ? text.slice(0, 500) : undefined,
  };
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

  private chats = new Map<string, Chat>();
  private contacts = new Map<string, Contact>();
  private messagesByJid = new Map<string, WAMessage[]>();

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
      if (this.sock) {
        try {
          await this.sock.logout('TTT user removed linked device');
        } catch (e) {
          this.logger.warn('whatsapp sock.logout failed, forcing local teardown', e);
          this.teardownSocket();
        }
      } else {
        this.teardownSocket();
      }
      if (this.sock) {
        this.teardownSocket();
      }
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
    if (EXTENDED_WHATSAPP_TOOLS.has(toolName)) {
      await assertExtendedDataConsent();
    }

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
        const cap = caption ? { caption } : {};
        if (shouldSendUrlAsWhatsAppGifPlayback(url)) {
          await this.sock.sendMessage(jid, {
            video: { url },
            gifPlayback: true,
            ...cap,
          });
        } else {
          await this.sock.sendMessage(jid, {
            image: { url },
            ...cap,
          });
        }
        return JSON.stringify({ ok: true, to: jid }, null, 2);
      }
      case 'whatsapp_list_chats': {
        requireLinkedSock(this.sock, this.opened);
        const limRaw = args.limit;
        const limit = Math.min(
          50,
          Math.max(1, typeof limRaw === 'number' && Number.isFinite(limRaw) ? Math.floor(limRaw) : 20)
        );
        const rows = Array.from(this.chats.values())
          .map((c) => ({ c, id: chatRowId(c) }))
          .filter((x): x is { c: Chat; id: string } => Boolean(x.id));
        rows.sort((a, b) => tsNum(b.c.conversationTimestamp) - tsNum(a.c.conversationTimestamp));
        const sliced = rows.slice(0, limit);
        const out = sliced.map(({ c, id }) => {
          const contact = this.contacts.get(id);
          const name =
            (c as { name?: string }).name ||
            contact?.name ||
            contact?.notify ||
            undefined;
          return {
            id,
            name: name ?? null,
            unreadCount: (c as { unreadCount?: number }).unreadCount ?? undefined,
            conversationTimestamp: tsNum(c.conversationTimestamp) || tsNum(c.lastMessageRecvTimestamp),
          };
        });
        return JSON.stringify(
          {
            count: out.length,
            note:
              out.length === 0
                ? 'No chats in local cache. Full history is only negotiated on the first QR pairing after “extended” tools are enabled — use Log out / Forget session in settings, keep the option on, then link again. Keep the phone online 1–3 minutes. On Linux hosts we use a macOS Chrome client hint so WA sends history sync. Incoming messages still fill the list over time.'
                : 'Chats come from the local Baileys cache (history sync may still be in progress).',
            chats: out,
          },
          null,
          2
        );
      }
      case 'whatsapp_fetch_messages': {
        requireLinkedSock(this.sock, this.opened);
        const chatJid = typeof args.chatJid === 'string' ? args.chatJid.trim() : '';
        const to = typeof args.to === 'string' ? args.to.trim() : '';
        if (!chatJid && !to) {
          throw new Error('Provide either `chatJid` (full JID) or `to` (phone digits, no +).');
        }
        const jid = chatJid ? resolveChatJid(chatJid) : jidFromPhoneDigits(to);
        const limRaw = args.limit;
        const limit = Math.min(
          50,
          Math.max(1, typeof limRaw === 'number' && Number.isFinite(limRaw) ? Math.floor(limRaw) : 15)
        );
        const all = this.messagesByJid.get(jid) ?? [];
        const slice = all.slice(0, limit).map(summarizeWaMessage);
        return JSON.stringify({ chatJid: jid, count: slice.length, messages: slice }, null, 2);
      }
      case 'whatsapp_search_contacts': {
        requireLinkedSock(this.sock, this.opened);
        const q = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
        if (!q) {
          throw new Error('Missing non-empty `query`.');
        }
        const limRaw = args.limit;
        const limit = Math.min(
          30,
          Math.max(1, typeof limRaw === 'number' && Number.isFinite(limRaw) ? Math.floor(limRaw) : 15)
        );
        const matches: { id: string; name?: string; notify?: string }[] = [];
        for (const c of this.contacts.values()) {
          if (!c.id) continue;
          const hay = `${c.id} ${c.name ?? ''} ${c.notify ?? ''}`.toLowerCase();
          if (!hay.includes(q)) continue;
          matches.push({
            id: c.id,
            name: c.name,
            notify: c.notify,
          });
          if (matches.length >= limit) break;
        }
        return JSON.stringify({ query: args.query, count: matches.length, contacts: matches }, null, 2);
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  private clearDataStore(): void {
    this.chats.clear();
    this.contacts.clear();
    this.messagesByJid.clear();
  }

  private upsertChatFromMessage(m: WAMessage): void {
    const jid = m.key.remoteJid;
    if (!jid) return;
    const ts = m.messageTimestamp != null ? tsNum(m.messageTimestamp) : 0;
    const prev = this.chats.get(jid);
    const prevTs = prev
      ? Math.max(tsNum(prev.conversationTimestamp), tsNum(prev.lastMessageRecvTimestamp))
      : 0;
    const nextTs = Math.max(ts, prevTs);
    const base = (prev ?? { id: jid }) as Chat;
    this.chats.set(jid, { ...base, conversationTimestamp: nextTs } as Chat);
  }

  private upsertMessage(m: WAMessage): void {
    const jid = m.key.remoteJid;
    if (!jid) return;
    let arr = this.messagesByJid.get(jid) ?? [];
    const mid = m.key.id;
    const idx = mid ? arr.findIndex((x) => x.key.id === mid) : -1;
    if (idx >= 0) arr[idx] = m;
    else arr.unshift(m);
    arr = arr.slice(0, MAX_MSGS_PER_CHAT);
    this.messagesByJid.set(jid, arr);
  }

  private mergeContact(c: Contact): void {
    if (!c.id) return;
    const prev = this.contacts.get(c.id) ?? { id: c.id };
    this.contacts.set(c.id, { ...prev, ...c });
  }

  private bindEvHandlers(sock: WASocket): void {
    sock.ev.on('messaging-history.set', (hist) => {
      for (const c of hist.chats) {
        const id = chatRowId(c);
        if (id) {
          this.chats.set(id, c);
          if (this.chats.size > MAX_CHATS_CACHED) {
            const drop = this.chats.size - MAX_CHATS_CACHED;
            const keys = Array.from(this.chats.keys()).slice(0, drop);
            for (const k of keys) this.chats.delete(k);
          }
        }
      }
      for (const co of hist.contacts) this.mergeContact(co);
      for (const msg of hist.messages) {
        this.upsertChatFromMessage(msg);
        this.upsertMessage(msg);
      }
    });

    sock.ev.on('chats.upsert', (list: Chat[]) => {
      for (const c of list) {
        const id = chatRowId(c);
        if (id) this.chats.set(id, c);
      }
    });

    sock.ev.on('chats.update', (updates: ChatUpdate[]) => {
      for (const raw of updates) {
        const { conditional, ...patch } = raw as ChatUpdate & { id?: string };
        void conditional;
        const id = patch.id;
        if (!id) continue;
        const prev = this.chats.get(id) ?? ({ id } as Chat);
        this.chats.set(id, { ...prev, ...patch } as Chat);
      }
    });

    sock.ev.on('chats.delete', (ids: string[]) => {
      for (const id of ids) this.chats.delete(id);
    });

    sock.ev.on('contacts.upsert', (list: Contact[]) => {
      for (const c of list) this.mergeContact(c);
    });

    sock.ev.on('contacts.update', (list: Partial<Contact>[]) => {
      for (const u of list) {
        if (!u.id) continue;
        const prev = this.contacts.get(u.id) ?? { id: u.id };
        this.contacts.set(u.id, { ...prev, ...u });
      }
    });

    sock.ev.on('messages.upsert', ({ messages }: { messages: WAMessage[] }) => {
      for (const m of messages) {
        this.upsertChatFromMessage(m);
        this.upsertMessage(m);
      }
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    this.clearDataStore();
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

    const waPrefs = await readWhatsAppPreferences();
    const syncHistory = waPrefs.extendedDataTools;
    /**
     * Baileys maps WebSubPlatform to DARWIN/WIN32 only when browser[0] is "Mac OS" or "Windows".
     * Linux uses "Ubuntu", which keeps WEB_BROWSER and often never receives history-heavy sync.
     */
    const historyBrowser =
      syncHistory && hostPlatform() === 'linux'
        ? Browsers.macOS('Chrome')
        : syncHistory
          ? Browsers.appropriate('Chrome')
          : Browsers.ubuntu('Chrome');

    const sock = makeWASocket({
      auth: state,
      version: verInfo.version,
      printQRInTerminal: false,
      logger: silentLogger,
      syncFullHistory: syncHistory,
      browser: historyBrowser,
    });
    this.sock = sock;

    this.bindEvHandlers(sock);

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
