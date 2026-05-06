import type { Provider } from '../../../core/types.js';
import type { ToolRegistry, ToolResult } from '../../../core/tool-registry.js';
import { Logger } from '../../../utils/logger.js';
import { AfterEffectsConnection } from './connection.js';
import { createProjectTools } from './tools/project-tools.js';
import { createCompositionTools } from './tools/composition-tools.js';
import { createLayerCreateTools } from './tools/layer-create-tools.js';
import { createLayerPropertyTools } from './tools/layer-property-tools.js';
import { createLayerLifecycleTools } from './tools/layer-lifecycle-tools.js';

/**
 * Adobe After Effects provider.
 * Supports composition management, layer creation, and animation control.
 */
class AfterEffectsProvider implements Provider {
  readonly id = 'after-effects';
  readonly displayName = 'Adobe After Effects';
  private logger = new Logger('AfterEffectsProvider');
  private connection = new AfterEffectsConnection();

  register(registry: ToolRegistry): void {
    const conn = this.connection;

    registry.register('aftereffects_ping', {
      tool: {
        name: 'aftereffects_ping',
        description: 'Test connection to After Effects',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => {
        const ok = await conn.ping();
        return {
          content: [
            {
              type: 'text' as const,
              text: ok
                ? 'Successfully connected to After Effects'
                : 'Failed to connect to After Effects',
            },
          ],
        };
      },
    });

    registry.register('aftereffects_get_version', {
      tool: {
        name: 'aftereffects_get_version',
        description: 'Get After Effects version information',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async (): Promise<ToolResult> => {
        const version = await conn.getVersion();
        return {
          content: [{ type: 'text' as const, text: `After Effects version: ${version}` }],
        };
      },
    });

    const groups = [
      createProjectTools(conn),
      createCompositionTools(conn),
      createLayerCreateTools(conn),
      createLayerPropertyTools(conn),
      createLayerLifecycleTools(conn),
    ];

    let count = 2;
    for (const group of groups) {
      for (const tool of group) {
        registry.register(tool.tool.name, tool);
        count++;
      }
    }
    this.logger.info(`Registered ${count} After Effects tools`);
  }
}

const afterEffectsProvider: Provider = new AfterEffectsProvider();
export default afterEffectsProvider;
