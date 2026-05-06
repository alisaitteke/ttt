import type { Provider } from '@ttt/core/types.js';
import type { ToolRegistry, ToolResult } from '@ttt/core/tool-registry.js';
import { TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV } from '@ttt/lib/ttt-paths.js';

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

function registerCoreWhatsAppTools(registry: ToolRegistry): void {
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

/** Only registered when the user enabled extended data consent in the TTT WhatsApp UI. */
function registerExtendedWhatsAppTools(registry: ToolRegistry): void {
  registry.register('whatsapp_list_chats', {
    tool: {
      name: 'whatsapp_list_chats',
      description:
        'List recent chats from the local Baileys sync cache (metadata: id, name, unread, timestamps). Requires extended data consent. Data may be incomplete until history syncs.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max chats to return (1–50, default 20).' },
        },
      },
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
      bridgeInvoke('whatsapp_list_chats', args),
  });

  registry.register('whatsapp_fetch_messages', {
    tool: {
      name: 'whatsapp_fetch_messages',
      description:
        'Read recent messages for one chat from the local Baileys message cache (text snippets and types). Provide `chatJid` (full JID) or `to` (phone digits). Requires extended consent.',
      inputSchema: {
        type: 'object',
        properties: {
          chatJid: { type: 'string', description: 'Full WhatsApp chat JID (e.g. ...@s.whatsapp.net).' },
          to: { type: 'string', description: 'Phone digits if JID unknown (country code, no +).' },
          limit: { type: 'number', description: 'Max messages (1–50, default 15).' },
        },
      },
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
      bridgeInvoke('whatsapp_fetch_messages', args),
  });

  registry.register('whatsapp_search_contacts', {
    tool: {
      name: 'whatsapp_search_contacts',
      description:
        'Search synced contacts by substring in id, saved name, or notify name. Limited rows. Requires extended consent.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Case-insensitive substring.' },
          limit: { type: 'number', description: 'Max results (1–30, default 15).' },
        },
        required: ['query'],
      },
    },
    handler: async (args: Record<string, unknown>): Promise<ToolResult> =>
      bridgeInvoke('whatsapp_search_contacts', args),
  });
}

class WhatsAppToolsProvider implements Provider {
  readonly id = 'whatsapp';
  readonly displayName = 'WhatsApp';

  register(registry: ToolRegistry): void {
    registerCoreWhatsAppTools(registry);
    if (process.env[TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV] === '1') {
      registerExtendedWhatsAppTools(registry);
    }
  }
}

const whatsappToolsProvider: Provider = new WhatsAppToolsProvider();

export default whatsappToolsProvider;
