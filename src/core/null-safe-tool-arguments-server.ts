import { Server, type ServerOptions } from '@modelcontextprotocol/sdk/server/index.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * MCP clients sometimes send `"arguments": null` for parameterless tools. The SDK schema
 * treats `arguments` as optional but does not accept null (only undefined / omitted).
 * Normalize before Zod validation runs in the protocol stack.
 */
function normalizeToolsCallMessage(message: unknown): void {
  if (message === null || typeof message !== 'object') return;
  const m = message as { method?: string; params?: { arguments?: unknown } };
  if (m.method !== 'tools/call' || !m.params) return;
  if (m.params.arguments !== null) return;
  m.params.arguments = {};
}

export class NullSafeToolArgumentsServer extends Server {
  constructor(serverInfo: Implementation, options?: ServerOptions) {
    super(serverInfo, options);
  }

  override async connect(transport: Transport): Promise<void> {
    await super.connect(transport);
    const protocolOnMessage = transport.onmessage;
    if (!protocolOnMessage) return;
    transport.onmessage = (message, extra) => {
      normalizeToolsCallMessage(message);
      protocolOnMessage(message, extra);
    };
  }
}
