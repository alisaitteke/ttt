import type { Provider } from '../../../core/types.js';
import type { ToolRegistry, ToolResult } from '../../../core/tool-registry.js';
import { Logger } from '../../../utils/logger.js';
import { PhotoshopConnection } from './connection.js';
import { createDocumentTools } from './tools/document-tools.js';
import { createLayerTools } from './tools/layer-tools.js';
import { createImageTools } from './tools/image-tools.js';
import { createImagePlacementTools } from './tools/image-placement-tools.js';
import { createLayerTransformTools } from './tools/layer-transform-tools.js';
import { createLayerPropertiesTools } from './tools/layer-properties-tools.js';
import { createFilterTools } from './tools/filter-tools.js';
import { createAdjustmentTools } from './tools/adjustment-tools.js';
import { createTextTools } from './tools/text-tools.js';
import { createSelectionTools } from './tools/selection-tools.js';
import { createActionTools } from './tools/action-tools.js';
import { createHistoryTools } from './tools/history-tools.js';
import { createLayerOrderingTools } from './tools/layer-ordering-tools.js';

/**
 * Adobe Photoshop provider — the most complete TTT integration today.
 * Spawns a single connection that's reused across all photoshop_* tool calls.
 */
class PhotoshopProvider implements Provider {
  readonly id = 'photoshop';
  readonly displayName = 'Adobe Photoshop';
  private logger = new Logger('PhotoshopProvider');
  private connection = new PhotoshopConnection();

  register(registry: ToolRegistry): void {
    const conn = this.connection;

    registry.register('photoshop_ping', {
      tool: {
        name: 'photoshop_ping',
        description: 'Test connection to Photoshop',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => {
        const ok = await conn.ping();
        return {
          content: [
            {
              type: 'text' as const,
              text: ok ? 'Successfully connected to Photoshop' : 'Failed to connect to Photoshop',
            },
          ],
        };
      },
    });

    registry.register('photoshop_get_version', {
      tool: {
        name: 'photoshop_get_version',
        description: 'Get Photoshop version information',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => {
        const version = await conn.getVersion();
        return {
          content: [{ type: 'text' as const, text: `Photoshop version: ${version}` }],
        };
      },
    });

    const groups = [
      createDocumentTools(conn),
      createLayerTools(conn),
      createImageTools(conn),
      createImagePlacementTools(conn),
      createLayerTransformTools(conn),
      createLayerPropertiesTools(conn),
      createFilterTools(conn),
      createAdjustmentTools(conn),
      createTextTools(conn),
      createSelectionTools(conn),
      createActionTools(conn),
      createHistoryTools(conn),
      createLayerOrderingTools(conn),
    ];

    let count = 2; // ping + get_version
    for (const group of groups) {
      for (const tool of group) {
        registry.register(tool.tool.name, tool);
        count++;
      }
    }
    this.logger.info(`Registered ${count} Photoshop tools`);
  }
}

const photoshopProvider: Provider = new PhotoshopProvider();
export default photoshopProvider;
