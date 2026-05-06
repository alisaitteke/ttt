import { ToolDefinition, ToolResult } from '../../../../core/tool-registry.js';
import { AfterEffectsConnection } from '../connection.js';
import { AfterEffectsExtendScriptSnippets } from '../extendscript.js';

export function createLayerPropertyTools(connection: AfterEffectsConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'aftereffects_set_layer_transform',
        description: 'Set transform properties for a layer',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            layer: {
              type: 'string',
              description: 'Name of the layer',
            },
            position: {
              type: 'array',
              description: 'Position [x, y] in pixels',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
            scale: {
              type: 'array',
              description: 'Scale [x, y] in percent',
              items: { type: 'number' },
              minItems: 2,
              maxItems: 2,
            },
            rotation: {
              type: 'number',
              description: 'Rotation in degrees',
            },
          },
          required: ['composition', 'layer'],
        },
      },
      handler: async (args) => setLayerTransform(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_set_layer_opacity',
        description: 'Set opacity for a layer',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            layer: {
              type: 'string',
              description: 'Name of the layer',
            },
            opacity: {
              type: 'number',
              description: 'Opacity value (0-100)',
              minimum: 0,
              maximum: 100,
            },
          },
          required: ['composition', 'layer', 'opacity'],
        },
      },
      handler: async (args) => setLayerOpacity(connection, args),
    },
  ];
}

async function setLayerTransform(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const layer = args.layer as string;
  const position = args.position as [number, number] | undefined;
  const scale = args.scale as [number, number] | undefined;
  const rotation = args.rotation as number | undefined;

  try {
    const script = AfterEffectsExtendScriptSnippets.setLayerTransform(
      composition,
      layer,
      position,
      scale,
      rotation
    );
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer transform updated:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error setting layer transform: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function setLayerOpacity(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const layer = args.layer as string;
  const opacity = args.opacity as number;

  try {
    const script = AfterEffectsExtendScriptSnippets.setLayerOpacity(composition, layer, opacity);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer opacity updated:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error setting layer opacity: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
