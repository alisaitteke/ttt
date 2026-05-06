import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Logger } from '../utils/logger.js';
import { ToolRegistry } from './tool-registry.js';
import { Session } from './session.js';
import { createDocumentTools } from '../tools/photoshop/document-tools.js';
import { createLayerTools } from '../tools/photoshop/layer-tools.js';
import { createImageTools } from '../tools/photoshop/image-tools.js';
import { createImagePlacementTools } from '../tools/photoshop/image-placement-tools.js';
import { createLayerTransformTools } from '../tools/photoshop/layer-transform-tools.js';
import { createLayerPropertiesTools } from '../tools/photoshop/layer-properties-tools.js';
import { createFilterTools } from '../tools/photoshop/filter-tools.js';
import { createAdjustmentTools } from '../tools/photoshop/adjustment-tools.js';
import { createTextTools } from '../tools/photoshop/text-tools.js';
import { createSelectionTools } from '../tools/photoshop/selection-tools.js';
import { createActionTools } from '../tools/photoshop/action-tools.js';
import { createHistoryTools } from '../tools/photoshop/history-tools.js';
import { createLayerOrderingTools } from '../tools/photoshop/layer-ordering-tools.js';
import { createIllustratorTools } from '../tools/illustrator/tools.js';

export class AdobeAgentMCPServer {
  private server: Server;
  private logger: Logger;
  private toolRegistry: ToolRegistry;
  private session: Session;

  constructor() {
    this.logger = new Logger('AdobeAgentMCPServer');
    this.toolRegistry = new ToolRegistry();
    this.session = new Session();

    this.server = new Server(
      {
        name: 'adobe-agent',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
    this.setupHandlers();
  }

  private registerTools() {
    this.toolRegistry.register('photoshop_ping', {
      tool: {
        name: 'photoshop_ping',
        description: 'Test connection to Photoshop',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => await this.pingPhotoshop(),
    });

    this.toolRegistry.register('photoshop_get_version', {
      tool: {
        name: 'photoshop_get_version',
        description: 'Get Photoshop version information',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => await this.getVersion(),
    });

    const connection = this.session.getConnection();

    createIllustratorTools().forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createDocumentTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createLayerTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createImageTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createImagePlacementTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createLayerTransformTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createLayerPropertiesTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createFilterTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createAdjustmentTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createTextTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createSelectionTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createActionTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createHistoryTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    createLayerOrderingTools(connection).forEach((tool) => {
      this.toolRegistry.register(tool.tool.name, tool);
    });

    this.logger.info(`Registered ${this.toolRegistry.count()} tools`);
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      this.logger.debug('Listing available tools');
      return {
        tools: this.toolRegistry.list(),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logger.debug(`Tool called: ${request.params.name}`);

      try {
        const args = (request.params.arguments as Record<string, unknown>) || {};
        const result = await this.toolRegistry.execute(request.params.name, args);

        // Update session activity
        this.session.updateActivity();

        return result;
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

  private async pingPhotoshop() {
    const connection = this.session.getConnection();
    const isConnected = await connection.ping();
    return {
      content: [
        {
          type: 'text' as const,
          text: isConnected
            ? 'Successfully connected to Photoshop'
            : 'Failed to connect to Photoshop',
        },
      ],
    };
  }

  private async getVersion() {
    const connection = this.session.getConnection();
    const version = await connection.getVersion();
    return {
      content: [
        {
          type: 'text' as const,
          text: `Photoshop version: ${version}`,
        },
      ],
    };
  }

  async start() {
    // Initialize session
    await this.session.initialize();

    // Connect server transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger.info('MCP Server connected via stdio');
  }

  async stop() {
    await this.session.disconnect();
    this.logger.info('MCP Server stopped');
  }
}
