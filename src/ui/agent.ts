import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio';
import { stepCountIs, streamText, type LanguageModelUsage, type ModelMessage } from 'ai';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readWhatsAppPreferences,
  sanitizeExportChatSegment,
  TTT_EXPORT_CHAT_ID_ENV,
  TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV,
} from '@ttt/lib/ttt-paths.js';
import { getGiphyApiKey, TTT_GIPHY_API_KEY_ENV } from '@ttt/ui/integrations/giphy-key.js';
import type { ModelPricing, ProviderAdapter, ProviderId, UsageCost } from '@ttt/ui/providers/registry.js';
import {
  DESIGN_TOOLS,
  sanitizeDesignToolIds,
  type DesignToolId,
} from '@ttt/ui/providers/design-tools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// In production (`dist/ui/agent.js`) we point at the compiled `dist/index.js`.
// In development (`tsx watch src/ui/cli.ts`) the source `.ts` is loaded directly,
// so we resolve the TS entry and spawn it through Node's tsx loader.
const IS_DEV_SOURCE = __filename.endsWith('.ts');
const MCP_SERVER_ENTRY = IS_DEV_SOURCE
  ? resolve(__dirname, '..', 'index.ts')
  : resolve(__dirname, '..', 'index.js');

/** Max model↔tool steps per `streamText` segment (AI SDK `stepCountIs`). */
const STREAM_TEXT_STEP_BUDGET = 20;
/**
 * Max `streamText` invocations for one user message (first + continuations).
 * When an inner segment hits the step budget without a terminal `stop`, we
 * append assistant/tool messages and start a new segment.
 */
const MAX_STREAM_TEXT_SEGMENTS = 9;

const CONTINUE_AFTER_STEP_CAP_USER_TEXT = `Continue the same task in this turn. Use further tool calls if the job still needs them; otherwise reply with a concise user-facing summary of outcomes so far. If the request is already fully satisfied, answer briefly and do not call tools.`;

function mergeLanguageModelUsage(
  prev: LanguageModelUsage | undefined,
  next: LanguageModelUsage
): LanguageModelUsage {
  const n = (x: number | undefined): number => x ?? 0;
  if (!prev) return next;
  return {
    inputTokens: n(prev.inputTokens) + n(next.inputTokens),
    outputTokens: n(prev.outputTokens) + n(next.outputTokens),
    totalTokens: n(prev.totalTokens) + n(next.totalTokens),
    reasoningTokens: n(prev.reasoningTokens) + n(next.reasoningTokens),
    cachedInputTokens: n(prev.cachedInputTokens) + n(next.cachedInputTokens),
    inputTokenDetails: {
      noCacheTokens: n(prev.inputTokenDetails?.noCacheTokens) + n(next.inputTokenDetails?.noCacheTokens),
      cacheReadTokens: n(prev.inputTokenDetails?.cacheReadTokens) + n(next.inputTokenDetails?.cacheReadTokens),
      cacheWriteTokens: n(prev.inputTokenDetails?.cacheWriteTokens) + n(next.inputTokenDetails?.cacheWriteTokens),
    },
    outputTokenDetails: {
      textTokens: n(prev.outputTokenDetails?.textTokens) + n(next.outputTokenDetails?.textTokens),
      reasoningTokens: n(prev.outputTokenDetails?.reasoningTokens) + n(next.outputTokenDetails?.reasoningTokens),
    },
    raw: next.raw ?? prev.raw,
  };
}

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
   * When the UI hosts long-lived connection adapters (WhatsApp, …), MCP child
   * processes delegate tool calls to this loopback HTTP bridge.
   */
  connectionBridge?: { baseUrl: string; secret: string };
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
Cloud apps, Figma, Docker, messaging links (e.g. WhatsApp via TTT UI), and other
design surfaces — through the TTT MCP server.

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
call the relevant *_ping tool first (for **WhatsApp**, use \`whatsapp_status\`
instead — there is no \`whatsapp_ping\`), then continue with the substantive tool. Use
text-only answers only when the user clearly wants pure explanation with no
actionable tool, or when no listed tool applies.
After **every** tool result in the same turn, you must **keep going**: either call
the next tool the task still needs, or write a clear user-facing answer that
interprets the tool output. Do not stop silently right after one tool call when
the user still expects a summary or the job is unfinished.
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

/**
 * Demo Roy prompt injection: only when `TTT_DEMO_ROY_WHATSAPP` is set in the environment
 * (e.g. `export TTT_DEMO_ROY_WHATSAPP='+44…'`). If the variable is unset or empty, no demo line is added.
 * E.164-style input allowed; WhatsApp `to` must be digits only.
 */
function demoRoyWhatsAppDigitsFromEnv(): string | undefined {
  const raw = process.env.TTT_DEMO_ROY_WHATSAPP;
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}

/** Non-empty fragment only when {@link demoRoyWhatsAppDigitsFromEnv} returns digits. */
function demoRoyWhatsAppPromptFragment(): string {
  const digits = demoRoyWhatsAppDigitsFromEnv();
  if (!digits) return '';
  return `
- **Demo contact (Roy):** When the user asks to message **Roy** on WhatsApp, use the \`to\` value \`${digits}\` (WhatsApp tools require international digits only) for \`whatsapp_send_message\`, \`whatsapp_check_recipient\`, or \`whatsapp_fetch_messages\` as needed. In every user-visible message — narrative text, confirmations, headings, lists — refer to the recipient only as **Roy**. Never print, quote, spell out, or describe the phone number.`;
}

function buildSystemPrompt(
  designTools: DesignToolId[],
  providerId?: ProviderId,
  localeTag?: string,
  anonymousHostContext?: Record<string, unknown>,
  whatsappExtendedDataConsent?: boolean
): string {
  const hostBlock =
    anonymousHostContext !== undefined ? formatAnonymousHostContextSection(anonymousHostContext) : '';
  const langBlock = localeTag ? `\n\n${userUiLanguageInstruction(localeTag)}` : '';
  const hostPrefix = hostBlock ? `\n\n${hostBlock}` : '';

  if (designTools.length === 0) {
    return `${TTT_SYSTEM_PROMPT}\n\nCurrently no design tools are enabled for this chat. You can only respond with text.${hostPrefix}${langBlock}`.trim();
  }

  const toolsDesc = designTools.map(designToolPromptLine).join('\n');
  const extendedWa =
    designTools.includes('whatsapp') && whatsappExtendedDataConsent
      ? `
- **Extended data (user opted in):** \`whatsapp_list_chats\`, \`whatsapp_fetch_messages\` (needs \`chatJid\` or phone \`to\`), \`whatsapp_search_contacts\`. These read from a local Baileys cache; respect privacy and WhatsApp ToS.`
      : '';
  const demoRoyFragment = demoRoyWhatsAppPromptFragment();
  const whatsappBlock =
    designTools.includes('whatsapp')
      ? `

WhatsApp (Baileys via TTT UI):
- For session **reachability**, call \`whatsapp_status\` first (same role as \`*_ping\` for other apps).
- To **send plain text**, use \`whatsapp_send_message\`: \`to\` must be international digits only (no \`+\`, no spaces).
- Optional: \`whatsapp_check_recipient\` before sending to a new number.
- **Media routing:** If the user wants to send a **photo, picture, screenshot, or any image file** (or a looping GIF), use \`whatsapp_send_image\` — either \`imageUrl\` (\`http\`/\`https\`) or \`localFilePath\` (absolute under \`~/.ttt/drops\` or \`~/.ttt/exports\` only); exactly one source. Do **not** use \`whatsapp_send_document\` for those. For **animated GIFs** from URLs (e.g. \`giphy_search\`), pass \`gif_url\` or \`mp4_url\`, not \`preview_url\` (.webp is static). Use \`whatsapp_send_document\` only for **non-image** files (PDF, ZIP, Office, etc.) from the same directories. Same consent as other sends.${extendedWa}${demoRoyFragment}`
      : '';

  const giphyBlock =
    designTools.includes('giphy')
      ? `

GIPHY (GIF search via MCP):
- Use \`giphy_search\` with the user's keywords to find GIFs from GIPHY's catalog.
- Pass through **media URLs exactly as returned**; do not strip or rewrite query parameters on GIPHY URLs.
- Returned URLs are **remote only**. If any next step needs a **local file path** (\`filePath\`, open/place/save workflows), call \`giphy_download_media\` with that URL first, then use its \`local_path\`; never pass a GIPHY https URL where a disk path is required.
- When you present GIF results to the user (in chat or summaries), include visible **Powered by GIPHY** attribution (GIPHY API terms).`
      : '';

  const groqExtras = providerId === 'groq' ? `\n\n${GROQ_MCP_TOOL_ENFORCEMENT}` : '';

  return `${TTT_SYSTEM_PROMPT}

Currently enabled design tools for this chat:
${toolsDesc}${whatsappBlock}${giphyBlock}

Guidelines:
- Follow the Markdown response format described in your role instructions above.
- Only use tools that match the enabled design-tool prefixes above.
- **Tool loop:** When you use a tool and receive its result in the same turn, treat
  that as one step in a longer flow — continue with more tool calls if needed, or
  reply with text that explains what happened and what it means for the user. Avoid
  ending the turn with only a tool invocation when the user asked for an outcome or
  explanation.
- If unsure whether the target app is reachable, start with its *_ping tool
  (e.g. photoshop_ping, docker_ping). For WhatsApp, use \`whatsapp_status\` (not \`whatsapp_ping\`).
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
    const waPrefs = await readWhatsAppPreferences();
    const giphyKey = await getGiphyApiKey();
    const spawnArgs = IS_DEV_SOURCE ? ['--import', 'tsx', MCP_SERVER_ENTRY] : [MCP_SERVER_ENTRY];
    const mcpEnv: Record<string, string> = {
      ...sanitizedEnv(),
      LOG_LEVEL: process.env.LOG_LEVEL ?? '2',
      ...(opts.connectionBridge
        ? {
            TTT_CONNECTION_BRIDGE_URL: opts.connectionBridge.baseUrl,
            TTT_CONNECTION_BRIDGE_SECRET: opts.connectionBridge.secret,
          }
        : {}),
      ...(waPrefs.extendedDataTools
        ? { [TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV]: '1' }
        : { [TTT_WHATSAPP_EXTENDED_DATA_CONSENT_ENV]: '0' }),
      ...(giphyKey ? { [TTT_GIPHY_API_KEY_ENV]: giphyKey } : {}),
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
      opts.anonymousHostContext,
      waPrefs.extendedDataTools
    );

    let messages: ModelMessage[] = [...opts.history, { role: 'user', content: opts.prompt }];
    const toolMode = Object.keys(tools).length > 0;
    const segmentBudget = toolMode ? MAX_STREAM_TEXT_SEGMENTS : 1;

    let aggregatedUsage: LanguageModelUsage | undefined;
    let lastFinishReason: string | undefined;

    for (let segmentIndex = 0; segmentIndex < segmentBudget; segmentIndex++) {
      const result = streamText({
        model: opts.provider.getLanguageModel({
          apiKey: opts.apiKey,
          modelId: opts.modelId,
        }),
        tools,
        system: systemPrompt,
        messages,
        stopWhen: stepCountIs(20),
        ...(opts.provider.id === 'groq'
          ? {
              maxOutputTokens: 8192,
            }
          : {}),
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
            if (part.totalUsage) {
              aggregatedUsage = mergeLanguageModelUsage(aggregatedUsage, part.totalUsage);
            }
            lastFinishReason = part.finishReason;
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

      const response = await result.response;
      const steps = await result.steps;
      const finishReason = await result.finishReason;

      messages = [...messages, ...response.messages];

      const hitStepCap = toolMode && steps.length >= STREAM_TEXT_STEP_BUDGET;
      const shouldContinue =
        hitStepCap &&
        finishReason !== 'stop' &&
        finishReason !== 'error' &&
        segmentIndex + 1 < segmentBudget &&
        !opts.abortSignal.aborted;

      if (!shouldContinue) {
        break;
      }

      messages.push({ role: 'user', content: CONTINUE_AFTER_STEP_CAP_USER_TEXT });
    }

    if (aggregatedUsage !== undefined) {
      const pricing = opts.provider.getModelPricing(opts.modelId);
      const cost = pricing ? computeCost(aggregatedUsage, pricing) : undefined;
      opts.onFinish?.({ usage: aggregatedUsage, cost });
      yield {
        type: 'finish',
        payload: {
          finishReason: lastFinishReason ?? 'stop',
          usage: aggregatedUsage,
          cost,
        },
      };
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
