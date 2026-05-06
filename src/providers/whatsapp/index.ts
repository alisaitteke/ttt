import type { Provider } from '../../core/types.js';
import type { ToolRegistry, ToolResult } from '../../core/tool-registry.js';

const BRIDGE_ENV_URL = 'TTT_CONNECTION_BRIDGE_URL';
const BRIDGE_ENV_SECRET = 'TTT_CONNECTION_BRIDGE_SECRET';

async function bridgeInvoke(
  toolName: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const base = process.env[BRIDGE_ENV_URL];
  const secret = process.env[BRIDGE_ENV_SECRET];
  if (!base?.trim() || !secret?.trim()) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'WhatsApp tools require the TTT web UI (ttt-ui). Start it, connect WhatsApp under Settings → Messaging, then use chat from the browser.',
        },
      ],
    };
  }
  const url = `${base.replace(/\/$/, '')}/api/internal/connections/whatsapp/tools/${encodeURIComponent(toolName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ttt-bridge-secret': secret,
    },
    body: JSON.stringify({ args }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
    const msg = j.message ?? j.error ?? res.statusText;
    return { content: [{ type: 'text' as const, text: msg }] };
  }
  const text = await res.text();
  return { content: [{ type: 'text' as const, text: text || '{}' }] };
}

class WhatsAppToolsProvider implements Provider {
  readonly id = 'whatsapp';
  readonly displayName = 'WhatsApp';

  register(registry: ToolRegistry): void {
    registry.register('whatsapp_status', {
      tool: {
        name: 'whatsapp_status',
        description:
          'WhatsApp reachability check (like *_ping for other apps): returns whether the TTT UI has an active Baileys-linked session on this machine. Call this before sending if you are unsure the bridge is connected. Does not validate recipient numbers.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => bridgeInvoke('whatsapp_status', {}),
    });

    registry.register('whatsapp_check_recipient', {
      tool: {
        name: 'whatsapp_check_recipient',
        description:
          'Ask WhatsApp whether a phone number is registered (Baileys onWhatsApp). Use before messaging when the user provided a new number. `to` is international digits only (no +). Requires linked session.',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient phone digits (country code, no +).' },
          },
          required: ['to'],
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
        bridgeInvoke('whatsapp_check_recipient', args),
    });

    registry.register('whatsapp_send_message', {
      tool: {
        name: 'whatsapp_send_message',
        description:
          'When the user asks you to send a WhatsApp text to someone, use this tool. Plain-text only; `to` = international digits without +. Requires explicit user consent and compliance with WhatsApp ToS. Prefer whatsapp_status (or a recent successful check) if connection is uncertain.',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient phone digits (country code, no +).' },
            text: { type: 'string', description: 'Message body.' },
          },
          required: ['to', 'text'],
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
        bridgeInvoke('whatsapp_send_message', args),
    });

    registry.register('whatsapp_send_image', {
      tool: {
        name: 'whatsapp_send_image',
        description:
          'Send one image from an http(s) URL via WhatsApp (Baileys fetches the URL). Optional caption. Same consent and ToS rules as text; `to` = digits only. The image URL must be publicly reachable by the host running TTT UI.',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient phone digits (country code, no +).' },
            imageUrl: {
              type: 'string',
              description: 'Public http(s) URL of the image (e.g. PNG or JPEG).',
            },
            caption: { type: 'string', description: 'Optional image caption.' },
          },
          required: ['to', 'imageUrl'],
        },
      },
      handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
        bridgeInvoke('whatsapp_send_image', args),
    });
  }
}

const whatsappToolsProvider: Provider = new WhatsAppToolsProvider();

export default whatsappToolsProvider;
