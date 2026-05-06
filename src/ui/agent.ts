import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { stepCountIs, streamText, type LanguageModelUsage, type ModelMessage } from 'ai';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeExportChatSegment, TTT_EXPORT_CHAT_ID_ENV } from '../lib/ttt-paths.js';
import type { ModelPricing, ProviderAdapter, ProviderId, UsageCost } from './providers/registry.js';
import {
  DESIGN_TOOLS,
  sanitizeDesignToolIds,
  type DesignToolId,
} from './providers/design-tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// In production (`dist/ui/agent.js`) we point at the compiled `dist/index.js`.
// In development (`tsx watch src/ui/cli.ts`) the source `.ts` is loaded directly,
// so we resolve the TS entry and spawn it through Node's tsx loader.
const IS_DEV_SOURCE = __filename.endsWith('.ts');
const MCP_SERVER_ENTRY = IS_DEV_SOURCE
  ? resolve(__dirname, '..', 'index.ts')
  : resolve(__dirname, '..', 'index.js');

export interface ToolCallPersist {
  id: string;
  name: string;
  input: unknown;
  result?: { ok: boolean; content: string };
  status: 'pending' | 'success' | 'error';
}

export interface AssistantBuffer {
  text: string;
  toolCalls: ToolCallPersist[];
}

export interface RunChatStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | 'error';
  payload: unknown;
}

export interface RunChatFinishInfo {
  usage: LanguageModelUsage;
  cost?: UsageCost;
}

export interface RunChatOptions {
  prompt: string;
  history: ModelMessage[];
  provider: ProviderAdapter;
  apiKey: string;
  modelId: string;
  designTools?: DesignToolId[];
  /**
   * User-selected UI locale (BCP 47), e.g. en-US. When set, the system prompt instructs the
   * model to reply in that language only.
   */
  locale?: string;
  /**
   * Anonymous machine/OS snapshot (JSON-ready) assembled on the UI server — no hostnames or user paths.
   * Injected into the system prompt so the model can tailor OS-specific guidance (paths, Docker/Desktop apps, Adobe installs).
   */
  anonymousHostContext?: Record<string, unknown>;
  /** When set, default exports use ~/.ttt/exports/<id>/ (passed to the MCP child as env). */
  exportChatId?: string;
  abortSignal: AbortSignal;
  onAssistantBuffer?: (buf: AssistantBuffer) => void;
  onFinish?: (info: RunChatFinishInfo) => void;
}

export const TTT_SYSTEM_PROMPT = `
You are an assistant that drives the user's local design tools — Adobe Creative
Cloud apps, Figma, Docker, and other design surfaces — through the TTT MCP server.

Format all narrative replies in GitHub-flavored Markdown: use headings, bullet or
numbered lists, **bold** and *italic* where helpful, inline \`code\` and fenced
code blocks for commands or snippets, and tables when comparing options. Keep tool
summaries and errors readable with short paragraphs and lists; do not use raw HTML.
`.trim();

/** Matches UI locale folders under `web/src/locales/<tag>/`; used to validate API input only. */
const UI_REPLY_LOCALE_NAMES: Record<string, string> = {
  'en-US': 'English (United States)',
  'es-ES': 'Spanish (Spain)',
  'zh-CN': 'Simplified Chinese (China)',
  'de-DE': 'German (Germany)',
  'tr-TR': 'Turkish (Turkey)',
  'ar-SA': 'Arabic (Saudi Arabia)',
};

export function normalizeChatLocale(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  return Object.hasOwn(UI_REPLY_LOCALE_NAMES, input) ? input : undefined;
}

function userUiLanguageInstruction(localeTag: string): string {
  const langName = UI_REPLY_LOCALE_NAMES[localeTag] ?? localeTag;
  return `
User interface language (required):
The user's application UI is set to "${langName}" (BCP 47: \`${localeTag}\`).
You MUST write every user-facing part of your answer — narrative text, Markdown headings and lists,
summaries or paraphrases of tool outcomes, confirmations, warnings, error explanations for the human,
and follow-up questions — exclusively in "${langName}".
Follow this rule strictly even if earlier messages used another language, unless this user message
explicitly asks you to use a different language in this turn.
Technical identifiers unchanged from tools (paths, opaque IDs, literals, snippets) stay as-is; any
human-readable prose around them must still match "${langName}".
`.trim();
}

function formatAnonymousHostContextSection(ctx: Record<string, unknown>): string {
  let json: string;
  try {
    json = JSON.stringify(ctx, null, 2);
  } catch {
    return '';
  }
  if (!json || json === '{}') return '';
  return `
Anonymous host context (JSON; non-identifying, no hostname or account identifiers).
Use it to infer OS conventions (path separators, process names, Adobe CC / Docker quirks), timezone hints,
and coarse performance headroom — not for fingerprinting or storage.
Prefer tool results over guessing; do not paste this blob back to the user unless they explicitly ask how you inferred their environment.

${json}
`.trim();
}

const GROQ_MCP_TOOL_ENFORCEMENT = `
Groq-specific (required):
When enabled MCP tools can fulfill any part of the user's request — including
checks, inspections, edits, docker actions, or app discovery — you must issue the
appropriate tool call(s) in your response turn instead of only describing what you
would do, hedging, or guessing from prior context. If reachability is uncertain,
call the relevant *_ping tool first, then continue with the substantive tool. Use
text-only answers only when the user clearly wants pure explanation with no
actionable tool, or when no listed tool applies.
`.trim();

function designToolPromptLine(id: DesignToolId): string {
  const tool = DESIGN_TOOLS[id];
  if (tool.toolPrefixes?.length) {
    const parts = tool.toolPrefixes.map((p) => `${p}*`).join(', ');
    return `- **${tool.label}** (${parts} tools)`;
  }
  return `- **${tool.label}** (${tool.toolPrefix}* tools)`;
}

function designToolAllowedPrefixes(id: DesignToolId): string[] {
  const tool = DESIGN_TOOLS[id];
  if (tool.toolPrefixes?.length) return [...tool.toolPrefixes];
  return [tool.toolPrefix];
}

function buildSystemPrompt(
  designTools: DesignToolId[],
  providerId?: ProviderId,
  localeTag?: string,
  anonymousHostContext?: Record<string, unknown>
): string {
  const hostBlock =
    anonymousHostContext !== undefined ? formatAnonymousHostContextSection(anonymousHostContext) : '';
  const langBlock = localeTag ? `\n\n${userUiLanguageInstruction(localeTag)}` : '';
  const hostPrefix = hostBlock ? `\n\n${hostBlock}` : '';

  if (designTools.length === 0) {
    return `${TTT_SYSTEM_PROMPT}\n\nCurrently no design tools are enabled for this chat. You can only respond with text.${hostPrefix}${langBlock}`.trim();
  }

  const toolsDesc = designTools.map(designToolPromptLine).join('\n');

  const groqExtras = providerId === 'groq' ? `\n\n${GROQ_MCP_TOOL_ENFORCEMENT}` : '';

  return `${TTT_SYSTEM_PROMPT}

Currently enabled design tools for this chat:
${toolsDesc}

Guidelines:
- Follow the Markdown response format described in your role instructions above.
- Only use tools that match the enabled design-tool prefixes above.
- If unsure whether the target app is reachable, start with its *_ping tool
  (e.g. photoshop_ping, docker_ping).
- Prefer single, well-scoped tool calls instead of long combined operations.
- After meaningful state changes, briefly describe in plain language what you did.
- If a tool call fails, surface the error and ask before retrying or trying an
  alternative.
- Only MCP tools exposed by this TTT server are available. Do not attempt shell,
  filesystem, web, or general coding operations unless the user switches context.
- When saving files via tools, the \`path\` argument is optional; relative paths
  resolve under ~/.ttt/exports/<active-chat-id> in the web UI (under
  ~/.ttt/exports when no chat scope, e.g. CLI); absolute paths are used as given.${groqExtras}${hostPrefix}${langBlock}
`.trim();
}

export async function* runChat(opts: RunChatOptions): AsyncGenerator<RunChatStreamEvent> {
  let mcp: MCPClient | undefined;
  const buffer: AssistantBuffer = { text: '', toolCalls: [] };

  try {
    const spawnArgs = IS_DEV_SOURCE ? ['--import', 'tsx', MCP_SERVER_ENTRY] : [MCP_SERVER_ENTRY];
    const mcpEnv: Record<string, string> = {
      ...sanitizedEnv(),
      LOG_LEVEL: process.env.LOG_LEVEL ?? '2',
    };
    const exportSeg = sanitizeExportChatSegment(opts.exportChatId);
    if (exportSeg) {
      mcpEnv[TTT_EXPORT_CHAT_ID_ENV] = exportSeg;
    }

    mcp = await createMCPClient({
      transport: new Experimental_StdioMCPTransport({
        command: process.execPath,
        args: spawnArgs,
        env: mcpEnv,
      }),
    });

    const allTools = await mcp.tools();

    const designTools = sanitizeDesignToolIds(opts.designTools ?? []);
    const allowedPrefixes = designTools.flatMap((id) => designToolAllowedPrefixes(id));
    
    const tools =
      designTools.length === 0
        ? {}
        : Object.fromEntries(
            Object.entries(allTools).filter(([name]) =>
              allowedPrefixes.some((prefix) => name.startsWith(prefix))
            )
          );

    const systemPrompt = buildSystemPrompt(
      designTools,
      opts.provider.id,
      opts.locale,
      opts.anonymousHostContext
    );

    const result = streamText({
      model: opts.provider.getLanguageModel({
        apiKey: opts.apiKey,
        modelId: opts.modelId,
      }),
      tools,
      system: systemPrompt,
      messages: [...opts.history, { role: 'user', content: opts.prompt }],
      stopWhen: stepCountIs(20),
      abortSignal: opts.abortSignal,
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          buffer.text += part.text;
          yield { type: 'text-delta', payload: { text: part.text } };
          opts.onAssistantBuffer?.(buffer);
          break;
        }
        case 'tool-call': {
          const tc: ToolCallPersist = {
            id: part.toolCallId,
            name: part.toolName,
            input: part.input,
            status: 'pending',
          };
          buffer.toolCalls.push(tc);
          yield {
            type: 'tool-call',
            payload: { id: tc.id, name: tc.name, input: tc.input },
          };
          opts.onAssistantBuffer?.(buffer);
          break;
        }
        case 'tool-result': {
          const tc = buffer.toolCalls.find((c) => c.id === part.toolCallId);
          const text = stringifyToolOutput(part.output);
          if (tc) {
            tc.result = { ok: true, content: text };
            tc.status = 'success';
          }
          yield {
            type: 'tool-result',
            payload: { id: part.toolCallId, ok: true, content: text },
          };
          opts.onAssistantBuffer?.(buffer);
          break;
        }
        case 'tool-error': {
          const tc = buffer.toolCalls.find((c) => c.id === part.toolCallId);
          const text = (part.error as Error)?.message ?? String(part.error);
          if (tc) {
            tc.result = { ok: false, content: text };
            tc.status = 'error';
          }
          yield {
            type: 'tool-result',
            payload: { id: part.toolCallId, ok: false, content: text },
          };
          opts.onAssistantBuffer?.(buffer);
          break;
        }
        case 'finish': {
          const usage = part.totalUsage;
          const pricing = opts.provider.getModelPricing(opts.modelId);
          const cost = pricing ? computeCost(usage, pricing) : undefined;
          opts.onFinish?.({ usage, cost });
          yield {
            type: 'finish',
            payload: { finishReason: part.finishReason, usage, cost },
          };
          break;
        }
        case 'error': {
          yield {
            type: 'error',
            payload: { message: (part.error as Error)?.message ?? String(part.error) },
          };
          break;
        }
        default:
          break;
      }
    }
  } finally {
    if (mcp) await mcp.close().catch(() => undefined);
  }
}

export function computeCost(usage: LanguageModelUsage, pricing: ModelPricing): UsageCost {
  const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  // Prefer the explicit non-cache count when the provider reports it; otherwise
  // derive it from the total minus cache buckets so we don't double-bill.
  const totalInput = usage.inputTokens ?? 0;
  const noCache =
    usage.inputTokenDetails?.noCacheTokens ?? Math.max(0, totalInput - cacheRead - cacheWrite);
  const output = usage.outputTokens ?? 0;

  const inputUsd = (noCache / 1_000_000) * pricing.inputUsdPerMTok;
  const outputUsd = (output / 1_000_000) * pricing.outputUsdPerMTok;
  const cachedReadUsd =
    (cacheRead / 1_000_000) * (pricing.cachedInputUsdPerMTok ?? pricing.inputUsdPerMTok);
  const cachedWriteUsd =
    (cacheWrite / 1_000_000) * (pricing.cachedWriteUsdPerMTok ?? pricing.inputUsdPerMTok);

  return {
    totalUsd: inputUsd + outputUsd + cachedReadUsd + cachedWriteUsd,
    inputUsd,
    outputUsd,
    cachedReadUsd,
    cachedWriteUsd,
  };
}

function stringifyToolOutput(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  if (typeof output === 'object' && output !== null && 'content' in output) {
    const content = (output as { content?: Array<{ type?: string; text?: string }> }).content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === 'string' ? c : (c?.text ?? '')))
        .filter(Boolean)
        .join('\n');
    }
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

function sanitizedEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export function buildHistory(
  messages: Array<{ role: 'user' | 'assistant'; content: { text: string } }>
): ModelMessage[] {
  // Persisted history is rebuilt as plain text turns. Tool-call traces are
  // intentionally not replayed, since their results are already reflected in
  // the assistant's prior response text and re-issuing them would duplicate work.
  const history: ModelMessage[] = [];
  for (const m of messages) {
    const text = m.content.text?.trim();
    if (!text) continue;
    history.push({ role: m.role, content: text });
  }
  return history;
}
