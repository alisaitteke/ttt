import { ToolDefinition, ToolResult } from '../../../../core/tool-registry.js';
import { AfterEffectsConnection } from '../connection.js';
import { AfterEffectsExtendScriptSnippets } from '../extendscript.js';

export function createLayerLifecycleTools(connection: AfterEffectsConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'aftereffects_rename_layer',
        description: 'Rename a layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            oldName: {
              type: 'string',
              description: 'Current name of the layer',
            },
            newName: {
              type: 'string',
              description: 'New name for the layer',
            },
          },
          required: ['composition', 'oldName', 'newName'],
        },
      },
      handler: async (args) => renameLayer(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_delete_layer',
        description: 'Delete a layer from a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            layer: {
              type: 'string',
              description: 'Name of the layer to delete',
            },
          },
          required: ['composition', 'layer'],
        },
      },
      handler: async (args) => deleteLayer(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_duplicate_layer',
        description: 'Duplicate a layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            layer: {
              type: 'string',
              description: 'Name of the layer to duplicate',
            },
          },
          required: ['composition', 'layer'],
        },
      },
      handler: async (args) => duplicateLayer(connection, args),
    },
  ];
}

async function renameLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const oldName = args.oldName as string;
  const newName = args.newName as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.renameLayer(composition, oldName, newName);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer renamed:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error renaming layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function deleteLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const layer = args.layer as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.deleteLayer(composition, layer);
    await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer "${layer}" deleted from composition "${composition}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error deleting layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function duplicateLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const layer = args.layer as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.duplicateLayer(composition, layer);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer duplicated:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error duplicating layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
