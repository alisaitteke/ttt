import { serve, type ServerType } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir, platform as osPlatform } from 'node:os';
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { launchCreativeCloudDesktop } from '@ttt/providers/adobe/creative-cloud/desktop.js';
import { Logger } from '@ttt/utils/logger.js';
import {
  collectAnonymousHostContext,
  normalizeClientIanaTimezone,
  normalizeClientLocalWallClock,
  normalizeClientNowUtcIso,
  normalizeJsTimezoneOffsetMinutes,
} from '@ttt/ui/anonymous-host-context.js';
import {
  buildHistory,
  normalizeChatLocale,
  runChat,
  type AssistantBuffer,
  type RunChatFinishInfo,
} from '@ttt/ui/agent.js';
import {
  getConnectionBridgeConfig,
  setConnectionBridgeConfig,
} from '@ttt/ui/connection-bridge-config.js';
import {
  ensureProviderKeysMigrated,
  getProviderApiKey,
  loadConfig,
  maskApiKey,
  saveConfig,
  setProviderConfig,
  type ProviderId,
} from '@ttt/ui/config.js';
import { getProvider, listProviders } from '@ttt/ui/providers/registry.js';
import { sanitizeDesignToolIds, type DesignToolId } from '@ttt/ui/providers/design-tools.js';
import {
  listDesignToolsWithInstallStatus,
  resolveDefaultChatTools,
  invalidateDesignToolsListCache,
} from '@ttt/ui/providers/design-tool-detection.js';
import {
  appendMessage,
  createChat,
  deleteChat,
  getChat,
  getMessages,
  listChats,
  renameChat,
  setChatArchived,
  updateChatModel,
  updateChatTools,
} from '@ttt/ui/store/chats.js';
import {
  getLastComposerDesignToolsPreference,
  setLastComposerDesignToolsPreference,
} from '@ttt/ui/store/composer-design-tools-preference.js';
import { getDB } from '@ttt/ui/store/db.js';
import {
  getTttDropsDir,
  hasPersistedWhatsAppAuth,
  readWhatsAppPreferences,
  writeWhatsAppPreferences,
} from '@ttt/lib/ttt-paths.js';
import { getConnectionAdapter, listConnectionAdapters } from '@ttt/connections/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/ui/server.js -> ../../web/dist
const WEB_DIST = resolve(__dirname, '..', '..', 'web', 'dist');

/** Max size for drag-drop staging (browser → ~/.ttt/drops). Loopback-only endpoint. */
const STAGE_DROP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Max size for GET /api/files/download (streamed; same path rules as reveal). */
const FILE_DOWNLOAD_MAX_BYTES = STAGE_DROP_MAX_BYTES;

/** Max size for GET /api/files/preview (images only; same path rules as reveal). */
const FILE_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

function downloadAttachmentBasename(absolutePath: string): string {
  const base = basename(absolutePath).trim() || 'download';
  const safe = base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return safe || 'download';
}

const PREVIEW_IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

function imagePreviewMimeForPath(absolutePath: string): string | null {
  const ext = extname(absolutePath).toLowerCase();
  return PREVIEW_IMAGE_MIME[ext] ?? null;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

export interface UIServerOptions {
  port: number;
  host: string;
}

export interface UIServer {
  url: string;
  close(): Promise<void>;
}

export async function startUIServer(opts: UIServerOptions): Promise<UIServer> {
  const logger = new Logger('UIServer');
  const app = new Hono();

  // Initialize the SQLite database eagerly so the first request is fast and
  // any migration error surfaces during startup instead of mid-request.
  getDB();
  await ensureProviderKeysMigrated();

  const abortControllers = new Map<string, AbortController>();

  app.use('/api/*', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin && !isLoopbackOrigin(origin, opts.port)) {
      return c.json({ error: 'invalid_origin' }, 403);
    }
    return next();
  });

  // ---- Status -------------------------------------------------------------

  app.get('/api/status', async (c) => {
    const config = loadConfig();
    const activeId = config.activeProvider;
    const apiKey = await getProviderApiKey(activeId);
    return c.json({
      activeProvider: activeId,
      activeModel: config.activeModel,
      hasApiKey: Boolean(apiKey),
      apiKeyMasked: maskApiKey(apiKey),
      hostPlatform: osPlatform(),
    });
  });

  app.post('/api/files/reveal', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { path?: string };
    if (!body.path || typeof body.path !== 'string') {
      return c.json({ error: 'missing_path' }, 400);
    }
    try {
      const abs = await assertRevealableTarget(body.path);
      await revealPathInFileManager(abs);
      return c.json({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'path_not_found' || msg === 'empty_path') {
        return c.json({ error: msg }, 400);
      }
      if (msg === 'path_outside_home') {
        return c.json({ error: msg }, 403);
      }
      if (msg === 'unsupported_platform') {
        return c.json({ error: msg }, 501);
      }
      logger.error('reveal failed', e);
      return c.json({ error: 'reveal_failed', message: msg }, 500);
    }
  });

  app.get('/api/files/preview', async (c) => {
    const q = c.req.query('path');
    if (!q || typeof q !== 'string') {
      return c.json({ error: 'missing_path' }, 400);
    }
    try {
      const abs = await assertRevealableTarget(q.trim());
      const st = await stat(abs);
      if (!st.isFile()) {
        return c.json({ error: 'not_a_file' }, 400);
      }
      if (st.size > FILE_PREVIEW_MAX_BYTES) {
        return c.json({ error: 'file_too_large' }, 413);
      }
      const mime = imagePreviewMimeForPath(abs);
      if (!mime) {
        return c.json({ error: 'not_previewable' }, 415);
      }
      const buf = await readFile(abs);
      return new Response(buf, {
        headers: {
          'content-type': mime,
          'cache-control': 'private, max-age=60',
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'path_not_found' || msg === 'empty_path') {
        return c.json({ error: msg }, 404);
      }
      if (msg === 'path_outside_home') {
        return c.json({ error: msg }, 403);
      }
      logger.error('file preview failed', e);
      return c.json({ error: 'preview_failed', message: msg }, 500);
    }
  });

  app.get('/api/files/download', async (c) => {
    const q = c.req.query('path');
    if (!q || typeof q !== 'string') {
      return c.json({ error: 'missing_path' }, 400);
    }
    try {
      const abs = await assertRevealableTarget(q.trim());
      const st = await stat(abs);
      if (!st.isFile()) {
        return c.json({ error: 'not_a_file' }, 400);
      }
      if (st.size > FILE_DOWNLOAD_MAX_BYTES) {
        return c.json({ error: 'file_too_large' }, 413);
      }
      const nodeStream = createReadStream(abs);
      const body = Readable.toWeb(nodeStream);
      const name = downloadAttachmentBasename(abs);
      return new Response(body, {
        headers: {
          'content-type': 'application/octet-stream',
          'content-disposition': `attachment; filename="${name}"`,
          'content-length': String(st.size),
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'path_not_found' || msg === 'empty_path') {
        return c.json({ error: msg }, 404);
      }
      if (msg === 'path_outside_home') {
        return c.json({ error: msg }, 403);
      }
      logger.error('file download failed', e);
      return c.json({ error: 'download_failed', message: msg }, 500);
    }
  });

  app.post('/api/files/pick-local', async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { kind?: string };
      const kind: 'file' | 'folder' = body.kind === 'folder' ? 'folder' : 'file';
      const result = await pickLocalFileViaNativeDialog(logger, kind);
      if ('cancelled' in result) {
        return c.json({ cancelled: true as const });
      }
      return c.json({ path: result.path });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'unsupported_platform') {
        return c.json({ error: msg }, 501);
      }
      if (msg === 'pick_timeout') {
        return c.json({ error: msg }, 408);
      }
      logger.error('pick-local failed', e);
      return c.json({ error: 'pick_failed', message: msg }, 500);
    }
  });

  app.post('/api/files/stage-drop', async (c) => {
    try {
      const body = await c.req.parseBody();
      const raw = body.file;
      if (!raw || !(raw instanceof File)) {
        return c.json({ error: 'missing_file' }, 400);
      }
      const size = raw.size;
      if (size > STAGE_DROP_MAX_BYTES) {
        return c.json({ error: 'file_too_large' }, 413);
      }
      const srcName = basename(raw.name || 'drop') || 'drop';
      const ext = extname(srcName) || '.bin';
      const dest = join(getTttDropsDir(), `drop-${randomUUID()}${ext}`);
      const buf = Buffer.from(await raw.arrayBuffer());
      await writeFile(dest, buf, { mode: 0o600 });
      return c.json({ path: dest });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('stage-drop failed', e);
      return c.json({ error: 'stage_drop_failed', message: msg }, 500);
    }
  });

  app.post('/api/active', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      activeProvider: ProviderId;
      activeModel: string;
    }>;
    const next = saveConfig({
      ...(body.activeProvider !== undefined ? { activeProvider: body.activeProvider } : {}),
      ...(body.activeModel !== undefined ? { activeModel: body.activeModel } : {}),
    });
    return c.json({ activeProvider: next.activeProvider, activeModel: next.activeModel });
  });

  // ---- Providers ----------------------------------------------------------

  app.get('/api/providers', async (c) => {
    const out = await Promise.all(
      listProviders().map(async (p) => {
        const apiKey = await getProviderApiKey(p.id);
        return {
          id: p.id,
          label: p.label,
          apiKeyHint: p.apiKeyHint,
          apiKeyHelpUrl: p.apiKeyHelpUrl,
          hasApiKey: Boolean(apiKey),
          apiKeyMasked: maskApiKey(apiKey),
          models: p.listModels(),
          defaultModel: p.defaultModel(),
        };
      })
    );
    return c.json(out);
  });

  // ---- Design Tools -------------------------------------------------------

  app.get('/api/design-tools', async (c) => {
    if (c.req.query('nocache') === '1') invalidateDesignToolsListCache();
    return c.json(await listDesignToolsWithInstallStatus());
  });

  app.post('/api/creative-cloud/launch', async (c) => {
    try {
      await launchCreativeCloudDesktop();
      return c.json({ ok: true as const });
    } catch (err) {
      logger.warn('creative cloud launch failed', err);
      return c.json({ error: (err as Error).message }, 500);
    }
  });

  // ---- Connection adapters (WhatsApp, …) -----------------------------------

  app.get('/api/connections', async (c) => {
    const items = await Promise.all(
      listConnectionAdapters().map(async (a) => {
        const info = await a.getPublicInfo();
        return info;
      })
    );
    return c.json({ connections: items });
  });

  app.get('/api/connections/whatsapp/preferences', async (c) => {
    const prefs = await readWhatsAppPreferences();
    return c.json(prefs);
  });

  app.patch('/api/connections/whatsapp/preferences', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { extendedDataTools?: unknown };
    const extended = body.extendedDataTools === true;
    const prev = await readWhatsAppPreferences();
    await writeWhatsAppPreferences({ extendedDataTools: extended });
    invalidateDesignToolsListCache();
    if (prev.extendedDataTools !== extended) {
      const wa = getConnectionAdapter('whatsapp');
      try {
        const info = await wa.getPublicInfo();
        if (info.connected) {
          await wa.disconnect();
          await wa.ensureSocket();
        }
      } catch (e) {
        logger.warn('whatsapp reconnect after preferences change', e);
      }
    }
    return c.json({ ok: true as const, extendedDataTools: extended });
  });

  app.post('/api/connections/whatsapp/pairing/start', async (c) => {
    try {
      await getConnectionAdapter('whatsapp').ensureSocket();
      invalidateDesignToolsListCache();
      return c.json({ ok: true as const });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.post('/api/connections/whatsapp/logout', async (c) => {
    try {
      await getConnectionAdapter('whatsapp').logout();
      invalidateDesignToolsListCache();
      return c.json({ ok: true as const });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  app.get('/api/connections/whatsapp/events', async (c) => {
    const adapter = getConnectionAdapter('whatsapp');
    return streamSSE(c, async (stream) => {
      const unsub = adapter.subscribe((ev) => {
        void stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      });
      try {
        const info = await adapter.getPublicInfo();
        await stream.writeSSE({
          event: 'snapshot',
          data: JSON.stringify({ connected: info.connected, sessionHint: info.sessionHint ?? null }),
        });
        const raw = adapter.getLatestQrRaw();
        if (raw) {
          await stream.writeSSE({ event: 'qr', data: JSON.stringify({ type: 'qr', raw }) });
        }
        while (true) {
          await new Promise<void>((r) => setTimeout(r, 60_000));
        }
      } finally {
        unsub();
      }
    });
  });

  app.post('/api/internal/connections/:adapterId/tools/:toolName', async (c) => {
    const cfg = getConnectionBridgeConfig();
    if (!cfg) return c.json({ error: 'bridge_unconfigured' }, 503);
    const secret = c.req.header('x-ttt-bridge-secret');
    if (!secret || secret !== cfg.secret) {
      return c.json({ error: 'forbidden' }, 403);
    }
    const adapterId = c.req.param('adapterId');
    const toolName = c.req.param('toolName');
    if (adapterId !== 'whatsapp') {
      return c.json({ error: 'unknown_adapter' }, 404);
    }
    const body = (await c.req.json().catch(() => ({}))) as { args?: Record<string, unknown> };
    const args = body.args ?? {};
    try {
      const out = await getConnectionAdapter('whatsapp').invokeTool(toolName, args);
      return c.text(out, 200);
    } catch (e) {
      return c.json({ message: (e as Error).message }, 500);
    }
  });

  app.post('/api/providers/:id/validate-key', async (c) => {
    const provider = getProvider(c.req.param('id'));
    if (!provider) return c.json({ ok: false, error: 'unknown_provider' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string };
    if (!body.apiKey) return c.json({ ok: false, error: 'missing_key' }, 400);
    if (!provider.validateApiKeyFormat(body.apiKey)) {
      return c.json({ ok: false, error: 'invalid_format' }, 200);
    }
    const result = await provider.validateApiKey(body.apiKey);
    return c.json(result);
  });

  app.post('/api/providers/:id/key', async (c) => {
    const provider = getProvider(c.req.param('id'));
    if (!provider) return c.json({ error: 'unknown_provider' }, 404);
    const body = (await c.req.json().catch(() => ({}))) as { apiKey?: string };
    if (!body.apiKey) return c.json({ error: 'missing_key' }, 400);
    if (!provider.validateApiKeyFormat(body.apiKey)) {
      return c.json({ error: 'invalid_format' }, 400);
    }
    await setProviderConfig(provider.id, { apiKey: body.apiKey });
    // If no active provider was set yet, bootstrap with this one.
    const cfg = loadConfig();
    if (!(await getProviderApiKey(cfg.activeProvider))) {
      saveConfig({ activeProvider: provider.id, activeModel: provider.defaultModel() });
    }
    return c.json({ ok: true, apiKeyMasked: maskApiKey(body.apiKey) });
  });

  app.delete('/api/providers/:id/key', async (c) => {
    const provider = getProvider(c.req.param('id'));
    if (!provider) return c.json({ error: 'unknown_provider' }, 404);
    await setProviderConfig(provider.id, { apiKey: undefined });
    return c.json({ ok: true });
  });

  // ---- Chats CRUD ---------------------------------------------------------

  app.get('/api/chats', (c) => {
    return c.json(listChats());
  });

  app.post('/api/chats', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      provider: ProviderId;
      model: string;
      title: string;
      tools: DesignToolId[];
    }>;
    const config = loadConfig();
    const providerId = body.provider ?? config.activeProvider;
    const provider = getProvider(providerId);
    if (!provider) return c.json({ error: 'unknown_provider' }, 400);
    const model = body.model ?? config.activeModel ?? provider.defaultModel();
    let tools: DesignToolId[];
    let toolsFromRequestBody = false;
    if (body.tools != null) {
      toolsFromRequestBody = true;
      tools = sanitizeDesignToolIds(body.tools);
    } else {
      const fromKv = getLastComposerDesignToolsPreference();
      tools = fromKv !== undefined ? fromKv : await resolveDefaultChatTools();
    }
    const chat = createChat({ provider: providerId, model, title: body.title, tools });
    if (toolsFromRequestBody) {
      setLastComposerDesignToolsPreference(chat.tools ?? []);
    }
    return c.json(chat);
  });

  app.get('/api/chats/:id', (c) => {
    const chat = getChat(c.req.param('id'));
    if (!chat) return c.json({ error: 'not_found' }, 404);
    const messages = getMessages(chat.id);
    return c.json({ chat, messages });
  });

  app.patch('/api/chats/:id', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Partial<{
      title: string;
      provider: ProviderId;
      model: string;
      tools: DesignToolId[];
      archived: boolean;
    }>;
    const id = c.req.param('id');
    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) return c.json({ error: 'invalid_title' }, 400);
      renameChat(id, t);
    }
    if (body.provider !== undefined || body.model !== undefined) {
      const chat = getChat(id);
      if (!chat) return c.json({ error: 'not_found' }, 404);
      const provider = body.provider ?? (chat.provider as ProviderId);
      const adapter = getProvider(provider);
      if (!adapter) return c.json({ error: 'unknown_provider' }, 400);
      const model = body.model ?? (body.provider ? adapter.defaultModel() : chat.model);
      updateChatModel(id, provider, model);
      saveConfig({ activeProvider: provider, activeModel: model });
    }
    if (body.tools !== undefined) {
      updateChatTools(id, body.tools);
    }
    if (body.archived !== undefined) {
      const chat = getChat(id);
      if (!chat) return c.json({ error: 'not_found' }, 404);
      setChatArchived(id, body.archived);
    }
    return c.json({ ok: true });
  });

  app.delete('/api/chats/:id', (c) => {
    deleteChat(c.req.param('id'));
    return c.json({ ok: true });
  });

  // ---- Chat streaming -----------------------------------------------------

  app.post('/api/chat', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      chatId?: string;
      prompt?: string;
      requestId?: string;
      locale?: unknown;
      timezone?: unknown;
      timezoneOffsetMinutes?: unknown;
      clientNowUtcIso?: unknown;
      clientLocalWallClockInIanaZone?: unknown;
    };
    if (!body.prompt || !body.chatId) {
      return c.json({ error: 'missing_chat_or_prompt' }, 400);
    }

    const chat = getChat(body.chatId);
    if (!chat) return c.json({ error: 'chat_not_found' }, 404);

    const provider = getProvider(chat.provider);
    if (!provider) return c.json({ error: 'unknown_provider' }, 400);

    const apiKey = await getProviderApiKey(chat.provider as ProviderId);
    if (!apiKey) return c.json({ error: 'no_api_key' }, 400);

    // Persist the user message first; auto-title the chat if it's still default.
    appendMessage({
      chatId: chat.id,
      role: 'user',
      content: { text: body.prompt, toolCalls: [] },
    });
    if (chat.title === 'New chat') {
      const title = body.prompt.trim().slice(0, 50) || 'New chat';
      renameChat(chat.id, title);
    }

    const history = buildHistory(getMessages(chat.id).slice(0, -1));
    const locale = normalizeChatLocale(body.locale);
    const clientTz = normalizeClientIanaTimezone(body.timezone);
    const clientTzOffset = normalizeJsTimezoneOffsetMinutes(body.timezoneOffsetMinutes);
    const clientUtc = normalizeClientNowUtcIso(body.clientNowUtcIso);
    const clientWall = normalizeClientLocalWallClock(body.clientLocalWallClockInIanaZone);
    const anonymousHostContext = collectAnonymousHostContext({
      ...(clientTz !== undefined ? { clientIanaTimezone: clientTz } : {}),
      ...(clientTzOffset !== undefined ? { clientTimezoneOffsetMinutes: clientTzOffset } : {}),
      ...(clientUtc !== undefined ? { clientNowUtcIso: clientUtc } : {}),
      ...(clientWall !== undefined ? { clientLocalWallClockInIanaZone: clientWall } : {}),
    });

    const requestId = body.requestId ?? crypto.randomUUID();
    const controller = new AbortController();
    abortControllers.set(requestId, controller);

    return streamSSE(c, async (stream) => {
      let buffer: AssistantBuffer = { text: '', toolCalls: [] };
      let lastFinish: RunChatFinishInfo | null = null;
      let assistantPersisted = false;

      const persistAssistant = () => {
        if (assistantPersisted) return;
        if (!buffer.text && buffer.toolCalls.length === 0) return;
        appendMessage({
          chatId: chat.id,
          role: 'assistant',
          content: {
            text: buffer.text,
            toolCalls: buffer.toolCalls,
            provider: chat.provider,
            model: chat.model,
            ...(lastFinish?.usage ? { usage: lastFinish.usage } : {}),
            ...(lastFinish?.cost ? { cost: lastFinish.cost } : {}),
          },
        });
        assistantPersisted = true;
      };

      await stream.writeSSE({ event: 'start', data: JSON.stringify({ requestId }) });
      try {
        const iterator = runChat({
          prompt: body.prompt!,
          history,
          provider,
          apiKey,
          modelId: chat.model,
          designTools: chat.tools ?? [],
          exportChatId: chat.id,
          anonymousHostContext,
          ...(locale ? { locale } : {}),
          abortSignal: controller.signal,
          connectionBridge: getConnectionBridgeConfig() ?? undefined,
          onAssistantBuffer: (b) => {
            buffer = b;
          },
          onFinish: (info) => {
            lastFinish = info;
          },
        });

        for await (const ev of iterator) {
          if (controller.signal.aborted) break;
          await stream.writeSSE({ event: ev.type, data: JSON.stringify(ev.payload) });
        }

        persistAssistant();
        await stream.writeSSE({ event: 'done', data: '{}' });
      } catch (err) {
        logger.error('chat error', err);
        persistAssistant();
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({ message: (err as Error).message }),
        });
      } finally {
        abortControllers.delete(requestId);
      }
    });
  });

  app.post('/api/abort/:id', (c) => {
    const id = c.req.param('id');
    const controller = abortControllers.get(id);
    if (!controller) return c.json({ ok: false, error: 'not_found' }, 404);
    controller.abort();
    abortControllers.delete(id);
    return c.json({ ok: true });
  });

  // ---- Static UI ----------------------------------------------------------

  // Files emitted by Vite under /assets carry content hashes in their names,
  // so they're safe to cache forever. Everything else (index.html, bare svg
  // favicon, etc.) must revalidate on each load.
  const cacheControlFor = (pathname: string): string =>
    pathname.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';

  app.get('*', async (c) => {
    const url = new URL(c.req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const safe = normalize(pathname).replace(/^[/\\]+/, '');
    const filePath = join(WEB_DIST, safe);
    if (!filePath.startsWith(WEB_DIST)) {
      return c.text('forbidden', 403);
    }
    try {
      const stats = await stat(filePath);
      if (stats.isFile()) {
        const buf = await readFile(filePath);
        const ext = '.' + safe.split('.').pop();
        return new Response(new Uint8Array(buf), {
          headers: {
            'content-type': MIME[ext] ?? 'application/octet-stream',
            'cache-control': cacheControlFor(safe),
          },
        });
      }
    } catch {
      // fall through to SPA fallback
    }
    try {
      const buf = await readFile(join(WEB_DIST, 'index.html'));
      return new Response(buf.toString('utf8'), {
        headers: {
          'content-type': MIME['.html']!,
          'cache-control': 'no-cache',
        },
      });
    } catch {
      return c.text('UI bundle not found. Run `npm run build` and try again.', 500);
    }
  });

  const bridgeSecret = randomBytes(32).toString('hex');
  setConnectionBridgeConfig({
    baseUrl: `http://${opts.host}:${opts.port}`,
    secret: bridgeSecret,
  });

  const server: ServerType = serve(
    { fetch: app.fetch, port: opts.port, hostname: opts.host },
    (info) => logger.info(`Listening on http://${opts.host}:${info.port}`)
  );

  getConnectionAdapter('whatsapp').subscribe((ev) => {
    if (ev.type === 'connected' || ev.type === 'disconnected' || ev.type === 'stream_error') {
      invalidateDesignToolsListCache();
    }
  });

  void (async () => {
    try {
      if (await hasPersistedWhatsAppAuth()) {
        void getConnectionAdapter('whatsapp')
          .ensureSocket()
          .catch((e) => logger.warn('whatsapp startup connect failed', e));
      }
    } catch (e) {
      logger.warn('whatsapp startup auth check failed', e);
    }
  })();

  return {
    url: `http://${opts.host}:${opts.port}`,
    close: () =>
      new Promise<void>((resolveClose) => {
        for (const controller of abortControllers.values()) controller.abort();
        abortControllers.clear();
        setConnectionBridgeConfig(null);
        void getConnectionAdapter('whatsapp').disconnect().catch(() => undefined);
        server.close(() => resolveClose());
      }),
  };
}

async function assertRevealableTarget(inputPath: string): Promise<string> {
  const trimmed = inputPath.trim();
  if (!trimmed) {
    throw new Error('empty_path');
  }
  const normalized = normalize(trimmed);
  let target: string;
  try {
    target = await realpath(normalized);
  } catch {
    throw new Error('path_not_found');
  }
  const home = homedir();
  let homeResolved: string;
  try {
    homeResolved = await realpath(home);
  } catch {
    homeResolved = normalize(home);
  }
  const rel = relative(homeResolved, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('path_outside_home');
  }
  return target;
}

const PICK_LOCAL_FILE_TIMEOUT_MS = 120_000;

type PickLocalKind = 'file' | 'folder';

function normalizePickedPath(raw: string, kind: PickLocalKind): string {
  let p = raw.trim().replace(/\r?\n+$/, '');
  if (kind === 'folder' && p.length > 1) {
    p = p.replace(/[/\\]+$/, '');
  }
  return p;
}

async function pickLocalFileViaNativeDialog(
  logger: Logger,
  kind: PickLocalKind
): Promise<{ path: string } | { cancelled: true }> {
  const plat = osPlatform();
  if (plat === 'darwin') {
    return pickLocalFileDarwin(logger, kind);
  }
  if (plat === 'win32') {
    return pickLocalFileWin32(logger, kind);
  }
  throw new Error('unsupported_platform');
}

function pickLocalFileDarwin(
  logger: Logger,
  kind: PickLocalKind
): Promise<{ path: string } | { cancelled: true }> {
  const script =
    kind === 'folder'
      ? 'POSIX path of (choose folder with prompt "Select a folder (path only - nothing is uploaded)")'
      : 'POSIX path of (choose file with prompt "Select a file (path only - file is not uploaded)")';
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('pick_timeout'));
    }, PICK_LOCAL_FILE_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const combined = `${err}${out}`.toLowerCase();
        if (combined.includes('user canceled') || combined.includes('(-128)')) {
          resolve({ cancelled: true });
          return;
        }
        logger.warn('osascript pick failed', { code, err });
        reject(new Error(err.trim() || `osascript exited with code ${code}`));
        return;
      }
      const path = normalizePickedPath(out, kind);
      if (!path) {
        resolve({ cancelled: true });
        return;
      }
      resolve({ path });
    });
  });
}

function pickLocalFileWin32(
  logger: Logger,
  kind: PickLocalKind
): Promise<{ path: string } | { cancelled: true }> {
  const ps =
    kind === 'folder'
      ? "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select a folder (path only - nothing is uploaded)'; if ($f.ShowDialog() -eq 'OK') { [Console]::Out.WriteLine($f.SelectedPath) }"
      : "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Select a file (path only - file is not uploaded)'; if ($d.ShowDialog() -eq 'OK') { [Console]::Out.WriteLine($d.FileName) }";
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('pick_timeout'));
    }, PICK_LOCAL_FILE_TIMEOUT_MS);
    child.stdout?.on('data', (d) => {
      out += d.toString();
    });
    child.stderr?.on('data', (d) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        logger.warn('powershell pick failed', { code, err });
        reject(new Error(err.trim() || `powershell exited with code ${code}`));
        return;
      }
      const path = normalizePickedPath(out, kind);
      if (!path) {
        resolve({ cancelled: true });
        return;
      }
      resolve({ path });
    });
  });
}

function revealPathInFileManager(absolutePath: string): Promise<void> {
  const plat = osPlatform();
  if (plat === 'darwin') {
    return new Promise((resolveFn, reject) => {
      const child = spawn('open', ['-R', absolutePath], { stdio: 'ignore' });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolveFn();
        else reject(new Error(`open exited with code ${code}`));
      });
    });
  }
  if (plat === 'win32') {
    return new Promise((resolveFn, reject) => {
      const child = spawn('explorer.exe', [`/select,${absolutePath}`], {
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', reject);
      child.on('close', () => resolveFn());
    });
  }
  throw new Error('unsupported_platform');
}

function isLoopbackOrigin(origin: string, port: number): boolean {
  try {
    const u = new URL(origin);
    const isLoopback =
      u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    return isLoopback && (u.port === '' || u.port === String(port));
  } catch {
    return false;
  }
}
