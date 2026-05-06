import type { Provider } from '@ttt/core/types.js';
import type { ToolRegistry, ToolResult } from '@ttt/core/tool-registry.js';
import { Logger } from '@ttt/utils/logger.js';

const GIPHY_SEARCH = 'https://api.giphy.com/v1/gifs/search';
const KEY_ENV = 'TTT_GIPHY_API_KEY';

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

class GiphyProvider implements Provider {
  id = 'giphy';
  displayName = 'GIPHY';
  private logger = new Logger('GiphyProvider');

  register(registry: ToolRegistry): void {
    registry.register('giphy_search', {
      tool: {
        name: 'giphy_search',
        description:
          'Search GIPHY for animated GIFs by keyword. Returns titles, ids, page links, and media URLs: gif_url (animated .gif), preview_url (often .webp), mp4_url. Use returned URLs exactly as given (do not strip or alter query parameters). When you show GIF results to the user, include visible "Powered by GIPHY" attribution (GIPHY API terms). Requires a GIPHY API key: Settings → Integrations in the TTT web UI, or the TTT_GIPHY_API_KEY environment variable.',
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

    this.logger.info('Registered GIPHY tools');
  }
}

const giphyProvider: Provider = new GiphyProvider();
export default giphyProvider;
