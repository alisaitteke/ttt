import { NullSafeToolArgumentsServer } from '@ttt/core/null-safe-tool-arguments-server.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '@ttt/utils/logger.js';
import { ToolRegistry } from '@ttt/core/tool-registry.js';
import type { Provider } from '@ttt/core/types.js';
import { providers as defaultProviders } from '@ttt/providers/index.js';

export interface TTTServerOptions {
  providers?: Provider[];
  name?: string;
  version?: string;
}

/**
 * Provider-agnostic MCP server for TTT.
 *
 * Knows nothing about Photoshop / Figma / etc. — it just hosts a {@link
 * ToolRegistry} that providers contribute tools to and routes MCP `tools/list`
 * and `tools/call` requests through it.
 */
export class TTTServer {
  private server: NullSafeToolArgumentsServer;
  private logger: Logger;
  private toolRegistry: ToolRegistry;
  private providers: Provider[];

  constructor(opts: TTTServerOptions = {}) {
    this.logger = new Logger('TTTServer');
    this.toolRegistry = new ToolRegistry();
    this.providers = opts.providers ?? defaultProviders;

    this.server = new NullSafeToolArgumentsServer(
      {
        name: opts.name ?? 'ttt',
        version: opts.version ?? '0.1.0',
      },
      {
        capabilities: { tools: {} },
      }
    );

    this.setupHandlers();
  }

  private async registerProviders(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.register(this.toolRegistry);
        this.logger.debug(`Loaded provider: ${provider.id}`);
      } catch (error) {
        this.logger.error(`Failed to register provider '${provider.id}':`, error);
      }
    }
    this.logger.info(
      `Registered ${this.toolRegistry.count()} tools across ${this.providers.length} providers`
    );
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing available tools');
      return { tools: this.toolRegistry.list() };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logger.debug(`Tool called: ${request.params.name}`);
      try {
        const args = (request.params.arguments as Record<string, unknown>) || {};
        return await this.toolRegistry.execute(request.params.name, args);
      } catch (error) {
        this.logger.error(`Tool execution failed: ${request.params.name}`, error);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start(): Promise<void> {
    await this.registerProviders();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('MCP Server connected via stdio');
  }

  async stop(): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.shutdown?.();
      } catch (error) {
        this.logger.error(`Provider '${provider.id}' shutdown failed:`, error);
      }
    }
    this.logger.info('MCP Server stopped');
  }
}
