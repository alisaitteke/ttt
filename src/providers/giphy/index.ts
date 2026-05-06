import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider } from '@ttt/core/types.js';
import type { ToolRegistry, ToolResult } from '@ttt/core/tool-registry.js';
import { appendRevealPathLine, getTttDropsDir } from '@ttt/lib/ttt-paths.js';
import { Logger } from '@ttt/utils/logger.js';

const GIPHY_SEARCH = 'https://api.giphy.com/v1/gifs/search';
const KEY_ENV = 'TTT_GIPHY_API_KEY';
/** Remote GIF/MP4 renditions can be large; cap memory fetch size. */
const GIPHY_DOWNLOAD_MAX_BYTES = 80 * 1024 * 1024;

interface GiphyImageRendition {
  url?: string;
  mp4?: string;
  webp?: string;
}

interface GiphyGif {
  id: string;
  title: string;
  url?: string;
  images?: {
    fixed_height?: GiphyImageRendition;
    fixed_height_small?: GiphyImageRendition;
    downsized?: GiphyImageRendition;
    downsized_medium?: GiphyImageRendition;
    downsized_small?: { mp4?: string };
    original?: GiphyImageRendition;
    preview_gif?: { url?: string };
  };
}

function pickAnimatedGifUrl(images: GiphyGif['images']): string {
  if (!images) return '';
  return (
    images.downsized?.url ||
    images.downsized_medium?.url ||
    images.fixed_height_small?.url ||
    images.fixed_height?.url ||
    images.preview_gif?.url ||
    images.original?.url ||
    ''
  );
}

function isAllowedGiphyMediaHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'media.giphy.com' || /^media\d+\.giphy\.com$/.test(h) || h === 'i.giphy.com';
}

function assertGiphyAssetDownloadUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('Invalid URL.');
  }
  if (u.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed.');
  }
  if (!isAllowedGiphyMediaHost(u.hostname)) {
    throw new Error('URL must use a GIPHY media host (e.g. media*.giphy.com).');
  }
  return u;
}

function fileExtensionForGiphyDownload(url: URL, contentType: string | null): string {
  const path = url.pathname.toLowerCase();
  if (path.endsWith('.gif')) return 'gif';
  if (path.endsWith('.mp4')) return 'mp4';
  if (path.endsWith('.webp')) return 'webp';

  const ct = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (ct === 'image/gif') return 'gif';
  if (ct === 'video/mp4') return 'mp4';
  if (ct === 'image/webp') return 'webp';

  return 'gif';
}

async function downloadGiphyMediaToDrops(urlStr: string): Promise<string> {
  const url = assertGiphyAssetDownloadUrl(urlStr);
  const canonical = url.toString();

  let res: Response;
  try {
    res = await fetch(canonical);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Download failed: ${msg}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const cl = res.headers.get('content-length');
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > GIPHY_DOWNLOAD_MAX_BYTES) {
      throw new Error(`File too large (Content-Length ${n} bytes).`);
    }
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > GIPHY_DOWNLOAD_MAX_BYTES) {
    throw new Error(`File exceeds maximum size (${GIPHY_DOWNLOAD_MAX_BYTES} bytes).`);
  }

  const ext = fileExtensionForGiphyDownload(url, res.headers.get('content-type'));
  const dir = join(getTttDropsDir(), 'giphy');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const shortHash = createHash('sha256').update(canonical).digest('hex').slice(0, 14);
  const dest = join(dir, `giphy-${shortHash}-${Date.now()}.${ext}`);
  await writeFile(dest, buf, { mode: 0o600 });
  return dest;
}

class GiphyProvider implements Provider {
  id = 'giphy';
  displayName = 'GIPHY';
  private logger = new Logger('GiphyProvider');

  register(registry: ToolRegistry): void {
    registry.register('giphy_search', {
      tool: {
        name: 'giphy_search',
        description:
          'Search GIPHY for animated GIFs by keyword. Returns titles, ids, page links, and remote media URLs: gif_url (animated .gif), preview_url (often .webp), mp4_url. Use returned URLs exactly as given (do not strip or alter query parameters). Important: these URLs are remote addresses only — they are not local file paths. Whenever you need a **local file on disk** for another tool (e.g. `photoshop_place_image`, `photoshop_open_image`, or any handler that expects `filePath`), you MUST call `giphy_download_media` first with the chosen URL and then pass that tool\'s returned `local_path`. Do not pass GIPHY http(s) URLs directly as `filePath`. When you show GIF results to the user, include visible "Powered by GIPHY" attribution (GIPHY API terms). Requires a GIPHY API key: Settings → Integrations in the TTT web UI, or the TTT_GIPHY_API_KEY environment variable.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search phrase (max 50 characters per GIPHY API).',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of GIFs to return (default 12, max 50).',
            },
            offset: {
              type: 'number',
              description: 'Pagination offset (default 0).',
            },
            rating: {
              type: 'string',
              enum: ['g', 'pg', 'pg-13', 'r'],
              description: 'Optional MPAA-style content rating filter.',
            },
          },
          required: ['query'],
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const apiKey = process.env[KEY_ENV]?.trim();
        if (!apiKey) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'GIPHY API key is not configured. Add a key under Settings → Integrations in the TTT web UI, or set the TTT_GIPHY_API_KEY environment variable.',
              },
            ],
          };
        }

        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) {
          return { content: [{ type: 'text' as const, text: 'Missing or empty query.' }] };
        }
        if (query.length > 50) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Query exceeds GIPHY maximum length of 50 characters.',
              },
            ],
          };
        }

        let limit = 12;
        if (typeof args.limit === 'number' && Number.isFinite(args.limit)) {
          limit = Math.min(50, Math.max(1, Math.floor(args.limit)));
        }
        let offset = 0;
        if (typeof args.offset === 'number' && Number.isFinite(args.offset)) {
          offset = Math.max(0, Math.floor(args.offset));
        }
        const rating =
          typeof args.rating === 'string' && ['g', 'pg', 'pg-13', 'r'].includes(args.rating)
            ? args.rating
            : undefined;

        const u = new URL(GIPHY_SEARCH);
        u.searchParams.set('api_key', apiKey);
        u.searchParams.set('q', query);
        u.searchParams.set('limit', String(limit));
        u.searchParams.set('offset', String(offset));
        if (rating) u.searchParams.set('rating', rating);

        let res: Response;
        try {
          res = await fetch(u.toString());
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { content: [{ type: 'text' as const, text: `GIPHY request failed: ${msg}` }] };
        }

        const raw = await res.text();
        type GiphySearchJson = {
          data?: GiphyGif[];
          meta?: { status: number; msg: string; response_id?: string };
        };
        let parsed: GiphySearchJson;
        try {
          parsed = JSON.parse(raw) as GiphySearchJson;
        } catch {
          return {
            content: [{ type: 'text' as const, text: `GIPHY returned non-JSON (HTTP ${res.status}).` }],
          };
        }

        const meta = parsed.meta;
        if (!meta || meta.status !== 200) {
          const code = meta?.status ?? res.status;
          const msg = meta?.msg ?? res.statusText;
          return {
            content: [
              {
                type: 'text' as const,
                text: `GIPHY error: meta status ${code}, ${msg}`,
              },
            ],
          };
        }

        const data = parsed.data ?? [];
        if (data.length === 0 && meta.response_id === '') {
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  'GIPHY returned an empty synthetic response (service issue). Try again later.',
              },
            ],
          };
        }

        const lines: string[] = [
          `GIPHY search ("${query}"): ${data.length} result(s). When presenting these GIFs to the user, show visible "Powered by GIPHY" attribution.`,
          '',
        ];

        for (const g of data) {
          const img = g.images;
          const gifUrl = pickAnimatedGifUrl(img);
          const preview =
            img?.fixed_height_small?.webp ||
            img?.fixed_height_small?.url ||
            img?.preview_gif?.url ||
            '';
          const mp4 =
            img?.downsized_small?.mp4 ||
            img?.original?.mp4 ||
            img?.fixed_height_small?.mp4 ||
            img?.fixed_height?.mp4 ||
            '';
          const page = g.url ?? `https://giphy.com/gifs/${g.id}`;
          lines.push(`- **${g.title || '(no title)'}** (id: ${g.id})`);
          lines.push(`  - page: ${page}`);
          if (gifUrl) lines.push(`  - gif_url: ${gifUrl}`);
          if (preview) lines.push(`  - preview_url: ${preview}`);
          if (mp4) lines.push(`  - mp4_url: ${mp4}`);
          lines.push('');
        }

        const text = lines.join('\n').trimEnd();
        this.logger.debug(`giphy_search: ${data.length} results`);
        return { content: [{ type: 'text' as const, text: text || 'No GIFs found.' }] };
      },
    });

    registry.register('giphy_download_media', {
      tool: {
        name: 'giphy_download_media',
        description:
          'Download a media URL from `giphy_search` (typically `gif_url`, or `mp4_url` / `preview_url` when needed) to the local TTT drops folder (~/.ttt/drops/giphy). Returns an absolute path suitable for `photoshop_place_image` / `photoshop_open_image`, which require local files — they cannot load http(s) URLs. Pass the URL exactly as returned by `giphy_search` (keep query parameters). Only https URLs on GIPHY CDN hosts are accepted.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description:
                '`gif_url`, `mp4_url`, or `preview_url` from `giphy_search` — full URL including query string.',
            },
          },
          required: ['url'],
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const raw = typeof args.url === 'string' ? args.url.trim() : '';
        if (!raw) {
          return {
            content: [{ type: 'text' as const, text: 'Missing or empty url.' }],
            isError: true,
          };
        }

        try {
          const localPath = await downloadGiphyMediaToDrops(raw);
          const msg = [
            `Saved GIPHY asset to local file.`,
            `local_path: ${localPath}`,
            `Use local_path as filePath for photoshop_place_image or photoshop_open_image.`,
          ].join('\n');
          this.logger.debug(`giphy_download_media: ${localPath}`);
          return {
            content: [{ type: 'text' as const, text: appendRevealPathLine(msg, localPath) }],
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: 'text' as const, text: `giphy_download_media failed: ${msg}` }],
            isError: true,
          };
        }
      },
    });

    this.logger.info('Registered GIPHY tools');
  }
}

const giphyProvider: Provider = new GiphyProvider();
export default giphyProvider;
