import { ToolDefinition, ToolResult } from '@ttt/core/tool-registry.js';
import {
  appendRevealPathLine,
  resolveTttOutputPath,
} from '@ttt/lib/ttt-paths.js';
import { PhotoshopConnection } from '@ttt/providers/adobe/photoshop/connection.js';
import { PhotoshopAPIFactory } from '@ttt/providers/adobe/photoshop/api/api-factory.js';
import { ExtendScriptSnippets } from '@ttt/providers/adobe/photoshop/api/extendscript.js';

/** Parsed payload from ExtendScriptSnippets.newDocument (wire uses percent-encoded strings). */
type CreateDocumentIdentity = {
  documentId: number;
  documentTitle: string;
  saved: boolean;
  filePath: string | null;
};

function tryDecodeURIComponent(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Normalizes executeScript return value: executors JSON.parse stdout when it is valid JSON.
 */
function parseNewDocumentScriptResult(raw: unknown): CreateDocumentIdentity | null {
  let payload: unknown = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  const rec = payload as Record<string, unknown>;
  const documentId = rec.documentId;
  if (typeof documentId !== 'number' || !Number.isFinite(documentId)) {
    return null;
  }
  const titleWire = rec.documentTitle;
  if (typeof titleWire !== 'string') {
    return null;
  }
  const documentTitle = tryDecodeURIComponent(titleWire);
  const saved = Boolean(rec.saved);
  let filePath: string | null = null;
  if (rec.filePath === null || rec.filePath === undefined) {
    filePath = null;
  } else if (typeof rec.filePath === 'string') {
    filePath = tryDecodeURIComponent(rec.filePath);
  } else {
    return null;
  }
  return { documentId, documentTitle, saved, filePath };
}

export function createDocumentTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_create_document',
        description:
          'Create a new Photoshop document with specified dimensions. The result includes documentId (Photoshop internal ID for this open document; use it in follow-up rounds to know which tab/document was created; it is not an OS file id) and documentTitle; filePath is present only when the document is already associated with a path on disk.',
        inputSchema: {
          type: 'object',
          properties: {
            width: {
              type: 'number',
              description: 'Document width in pixels',
              minimum: 1,
            },
            height: {
              type: 'number',
              description: 'Document height in pixels',
              minimum: 1,
            },
            resolution: {
              type: 'number',
              description: 'Document resolution in DPI (default: 72)',
              default: 72,
            },
            colorMode: {
              type: 'string',
              description: 'Color mode (RGB, CMYK, Grayscale)',
              enum: ['RGB', 'CMYK', 'Grayscale'],
              default: 'RGB',
            },
          },
          required: ['width', 'height'],
        },
      },
      handler: async (args) => createDocument(connection, args),
    },
    {
      tool: {
        name: 'photoshop_get_document_info',
        description: 'Get information about the active Photoshop document',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => getDocumentInfo(connection),
    },
    {
      tool: {
        name: 'photoshop_save_document',
        description: 'Save the active document in specified format',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Optional. Absolute path saves there unchanged. Relative paths resolve under ~/.ttt/exports. Omit for an auto-generated file in ~/.ttt/exports.',
            },
            format: {
              type: 'string',
              description: 'File format (PSD, JPEG, PNG)',
              enum: ['PSD', 'JPEG', 'PNG'],
              default: 'PSD',
            },
            quality: {
              type: 'number',
              description: 'Quality for JPEG (1-12, default: 8)',
              minimum: 1,
              maximum: 12,
              default: 8,
            },
          },
        },
      },
      handler: async (args) => saveDocument(connection, args),
    },
    {
      tool: {
        name: 'photoshop_close_document',
        description: 'Close the active Photoshop document',
        inputSchema: {
          type: 'object',
          properties: {
            save: {
              type: 'boolean',
              description: 'Whether to save changes before closing',
              default: false,
            },
          },
        },
      },
      handler: async (args) => closeDocument(connection, args),
    },
  ];
}

async function createDocument(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const width = args.width as number;
  const height = args.height as number;
  const resolution = (args.resolution as number) || 72;
  const colorMode = (args.colorMode as string) || 'RGB';

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const colorModeMap: Record<string, string> = {
      RGB: 'NewDocumentMode.RGB',
      CMYK: 'NewDocumentMode.CMYK',
      Grayscale: 'NewDocumentMode.GRAYSCALE',
    };

    const script = ExtendScriptSnippets.newDocument(
      width,
      height,
      resolution,
      colorModeMap[colorMode] || 'NewDocumentMode.RGB'
    );

    const raw = await api.executeScript(script);

    const summary = `Document created: ${width}x${height}px at ${resolution}dpi (${colorMode})`;
    const identity = parseNewDocumentScriptResult(raw);
    let text: string;
    if (identity) {
      text = `${summary}\n${JSON.stringify(
        {
          documentId: identity.documentId,
          documentTitle: identity.documentTitle,
          saved: identity.saved,
          filePath: identity.filePath,
          note:
            'documentId is the Photoshop internal identifier for this open document (same role as distinguishing document tabs); it is not an OS inode or cloud id.',
        },
        null,
        2
      )}`;
    } else {
      text = `${summary}\n(Could not read document identifier from Photoshop response.)`;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error creating document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function getDocumentInfo(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.getDocumentInfo();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Document info:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting document info: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

function formatToFileExtension(format: string): string {
  switch (format.toUpperCase()) {
    case 'JPEG':
      return 'jpg';
    case 'PNG':
      return 'png';
    default:
      return 'psd';
  }
}

function ensureFilenameExtension(filePath: string, ext: string): string {
  const suffix = `.${ext.replace(/^\.+/, '').toLowerCase()}`;
  if (filePath.toLowerCase().endsWith(suffix)) return filePath;
  return filePath + suffix;
}

async function saveDocument(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const format = (args.format as string) || 'PSD';
  const quality = (args.quality as number) || 8;
  const pathArg = typeof args.path === 'string' ? args.path : undefined;

  try {
    const ext = formatToFileExtension(format);
    let outPath = resolveTttOutputPath(pathArg, ext);
    outPath = ensureFilenameExtension(outPath, ext);

    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    let script;
    switch (format.toUpperCase()) {
      case 'JPEG':
        script = ExtendScriptSnippets.saveAsJPEG(outPath, quality);
        break;
      case 'PNG':
        script = ExtendScriptSnippets.saveAsPNG(outPath);
        break;
      default:
        script = ExtendScriptSnippets.saveAsPSD(outPath);
    }
    await api.executeScript(script);

    const msg = `Document saved as ${format} to: ${outPath}`;
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
          text: `Error saving document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function closeDocument(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const save = (args.save as boolean) || false;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.closeDocument(save);
    await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: save ? 'Document closed and saved' : 'Document closed without saving',
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error closing document: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
