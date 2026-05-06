import { ToolDefinition, ToolResult } from '@ttt/core/tool-registry.js';
import { AfterEffectsConnection } from '@ttt/providers/adobe/after-effects/connection.js';
import { AfterEffectsExtendScriptSnippets } from '@ttt/providers/adobe/after-effects/extendscript.js';

export function createLayerCreateTools(connection: AfterEffectsConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'aftereffects_create_text_layer',
        description: 'Create a text layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            text: {
              type: 'string',
              description: 'Text content',
            },
            x: {
              type: 'number',
              description: 'X position in pixels',
              default: 100,
            },
            y: {
              type: 'number',
              description: 'Y position in pixels',
              default: 100,
            },
          },
          required: ['composition', 'text'],
        },
      },
      handler: async (args) => createTextLayer(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_create_solid_layer',
        description: 'Create a solid color layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            name: {
              type: 'string',
              description: 'Name for the solid layer',
            },
            width: {
              type: 'number',
              description: 'Width in pixels',
            },
            height: {
              type: 'number',
              description: 'Height in pixels',
            },
            color: {
              type: 'array',
              description: 'RGB color values (0-1)',
              items: { type: 'number', minimum: 0, maximum: 1 },
              minItems: 3,
              maxItems: 3,
              default: [1, 0, 0],
            },
          },
          required: ['composition', 'name', 'width', 'height'],
        },
      },
      handler: async (args) => createSolidLayer(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_create_shape_layer',
        description: 'Create a shape layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            name: {
              type: 'string',
              description: 'Name for the shape layer',
            },
          },
          required: ['composition', 'name'],
        },
      },
      handler: async (args) => createShapeLayer(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_create_null_layer',
        description: 'Create a null object layer in a composition',
        inputSchema: {
          type: 'object',
          properties: {
            composition: {
              type: 'string',
              description: 'Name of the composition',
            },
            name: {
              type: 'string',
              description: 'Name for the null layer',
            },
          },
          required: ['composition', 'name'],
        },
      },
      handler: async (args) => createNullLayer(connection, args),
    },
  ];
}

async function createTextLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const text = args.text as string;
  const x = (args.x as number) || 100;
  const y = (args.y as number) || 100;

  try {
    const script = AfterEffectsExtendScriptSnippets.createTextLayer(composition, text, x, y);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Text layer created:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating text layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function createSolidLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const name = args.name as string;
  const width = args.width as number;
  const height = args.height as number;
  const color = (args.color as [number, number, number]) || [1, 0, 0];

  try {
    const script = AfterEffectsExtendScriptSnippets.createSolidLayer(
      composition,
      name,
      width,
      height,
      color
    );
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Solid layer created:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating solid layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function createShapeLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const name = args.name as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.createShapeLayer(composition, name);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Shape layer created:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating shape layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function createNullLayer(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const composition = args.composition as string;
  const name = args.name as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.createNullLayer(composition, name);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Null layer created:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating null layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
