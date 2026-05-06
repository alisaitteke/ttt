import { ToolDefinition, ToolResult } from '@ttt/core/tool-registry.js';
import { AfterEffectsConnection } from '@ttt/providers/adobe/after-effects/connection.js';
import { AfterEffectsExtendScriptSnippets } from '@ttt/providers/adobe/after-effects/extendscript.js';

export function createCompositionTools(connection: AfterEffectsConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'aftereffects_create_composition',
        description: 'Create a new composition in After Effects',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the composition',
            },
            width: {
              type: 'number',
              description: 'Width in pixels',
              minimum: 1,
            },
            height: {
              type: 'number',
              description: 'Height in pixels',
              minimum: 1,
            },
            duration: {
              type: 'number',
              description: 'Duration in seconds',
              minimum: 0.1,
              default: 10,
            },
            frameRate: {
              type: 'number',
              description: 'Frame rate (fps)',
              minimum: 1,
              default: 30,
            },
          },
          required: ['name', 'width', 'height'],
        },
      },
      handler: async (args) => createComposition(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_list_compositions',
        description: 'List all compositions in the current project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => listCompositions(connection),
    },
    {
      tool: {
        name: 'aftereffects_get_composition_info',
        description: 'Get information about a specific composition',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the composition',
            },
          },
          required: ['name'],
        },
      },
      handler: async (args) => getCompositionInfo(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_delete_composition',
        description: 'Delete a composition from the project',
        inputSchema: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the composition to delete',
            },
          },
          required: ['name'],
        },
      },
      handler: async (args) => deleteComposition(connection, args),
    },
  ];
}

async function createComposition(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = args.name as string;
  const width = args.width as number;
  const height = args.height as number;
  const duration = (args.duration as number) || 10;
  const frameRate = (args.frameRate as number) || 30;

  try {
    const script = AfterEffectsExtendScriptSnippets.createComposition(
      name,
      width,
      height,
      duration,
      frameRate
    );
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Composition created:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating composition: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function listCompositions(connection: AfterEffectsConnection): Promise<ToolResult> {
  try {
    const script = AfterEffectsExtendScriptSnippets.listCompositions();
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Compositions:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error listing compositions: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function getCompositionInfo(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = args.name as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.getCompositionInfo(name);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Composition info:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting composition info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function deleteComposition(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = args.name as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.deleteComposition(name);
    await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Composition "${name}" deleted successfully`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error deleting composition: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
