import { ToolDefinition, ToolResult } from '../../../../core/tool-registry.js';
import { AfterEffectsConnection } from '../connection.js';
import { AfterEffectsExtendScriptSnippets } from '../extendscript.js';

export function createProjectTools(connection: AfterEffectsConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'aftereffects_get_project_info',
        description: 'Get information about the current After Effects project',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => getProjectInfo(connection),
    },
    {
      tool: {
        name: 'aftereffects_save_project',
        description: 'Save the current After Effects project',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Full path where to save the project file (.aep)',
            },
          },
          required: ['path'],
        },
      },
      handler: async (args) => saveProject(connection, args),
    },
    {
      tool: {
        name: 'aftereffects_open_project',
        description: 'Open an After Effects project file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Full path to the project file (.aep)',
            },
          },
          required: ['path'],
        },
      },
      handler: async (args) => openProject(connection, args),
    },
  ];
}

async function getProjectInfo(connection: AfterEffectsConnection): Promise<ToolResult> {
  try {
    const script = AfterEffectsExtendScriptSnippets.getProjectInfo();
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Project info:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting project info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function saveProject(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const path = args.path as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.saveProject(path);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Project saved to: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error saving project: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function openProject(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const path = args.path as string;

  try {
    const script = AfterEffectsExtendScriptSnippets.openProject(path);
    const result = await connection.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Project opened: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error opening project: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
