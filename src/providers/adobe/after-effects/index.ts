import type { Provider } from '@ttt/core/types.js';
import type { ToolRegistry, ToolResult } from '@ttt/core/tool-registry.js';
import { Logger } from '@ttt/utils/logger.js';
import { AfterEffectsConnection } from '@ttt/providers/adobe/after-effects/connection.js';
import { createProjectTools } from '@ttt/providers/adobe/after-effects/tools/project-tools.js';
import { createCompositionTools } from '@ttt/providers/adobe/after-effects/tools/composition-tools.js';
import { createLayerCreateTools } from '@ttt/providers/adobe/after-effects/tools/layer-create-tools.js';
import { createLayerPropertyTools } from '@ttt/providers/adobe/after-effects/tools/layer-property-tools.js';
import { createLayerLifecycleTools } from '@ttt/providers/adobe/after-effects/tools/layer-lifecycle-tools.js';

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
