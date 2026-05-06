import { ToolDefinition, ToolResult } from '../../../../core/tool-registry.js';
import {
  appendRevealPathLine,
  resolveTttInputPath,
  resolveTttOutputPath,
} from '../../../../lib/ttt-paths.js';
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
              description:
                'Optional. Absolute path saves there unchanged. Relative paths resolve under ~/.ttt/exports. Omit for an auto-generated .aep in ~/.ttt/exports.',
            },
          },
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
              description:
                'Path to the .aep file. Absolute path is used as-is. Relative paths resolve under ~/.ttt/exports.',
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

function ensureAepExtension(filePath: string): string {
  if (filePath.toLowerCase().endsWith('.aep')) return filePath;
  return `${filePath}.aep`;
}

async function saveProject(
  connection: AfterEffectsConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const pathArg = typeof args.path === 'string' ? args.path : undefined;

  try {
    let outPath = resolveTttOutputPath(pathArg, 'aep');
    outPath = ensureAepExtension(outPath);

    const script = AfterEffectsExtendScriptSnippets.saveProject(outPath);
    const result = await connection.executeScript(script);

    const msg = `Project saved to: ${JSON.stringify(result)} (path: ${outPath})`;
    return {
      content: [
        {
          type: 'text' as const,
          text: appendRevealPathLine(msg, outPath),
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
  const raw = args.path as string;

  try {
    const path = resolveTttInputPath(raw);
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
