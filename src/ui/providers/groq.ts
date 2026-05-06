import { createGroq } from '@ai-sdk/groq';
import type { ProviderAdapter, ProviderModel } from './types.js';

// Models curated for tool calling on Groq; USD per 1M tokens from:
// https://home.cloud.groq.io/pricing (uncached input / output).
const MODELS: ProviderModel[] = [
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile',
    pricing: { inputUsdPerMTok: 0.59, outputUsdPerMTok: 0.79 },
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant',
    pricing: { inputUsdPerMTok: 0.05, outputUsdPerMTok: 0.08 },
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B',
    pricing: { inputUsdPerMTok: 0.11, outputUsdPerMTok: 0.34 },
  },
  {
    id: 'meta-llama/llama-4-maverick-17b-128e-instruct',
    label: 'Llama 4 Maverick 17B',
  },
  {
    id: 'moonshotai/kimi-k2-instruct-0905',
    label: 'Kimi K2 Instruct',
    pricing: { inputUsdPerMTok: 1.0, outputUsdPerMTok: 3.0, cachedInputUsdPerMTok: 0.5 },
  },
  {
    id: 'qwen/qwen3-32b',
    label: 'Qwen3 32B',
    pricing: { inputUsdPerMTok: 0.29, outputUsdPerMTok: 0.59 },
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'GPT-OSS 20B',
    pricing: {
      inputUsdPerMTok: 0.075,
      outputUsdPerMTok: 0.3,
      cachedInputUsdPerMTok: 0.0375,
    },
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B',
    pricing: {
      inputUsdPerMTok: 0.15,
      outputUsdPerMTok: 0.6,
      cachedInputUsdPerMTok: 0.075,
    },
  },
];

export const groqAdapter: ProviderAdapter = {
  id: 'groq',
  label: 'Groq',
  apiKeyHint: 'gsk_...',
  apiKeyHelpUrl: 'https://console.groq.com/keys',
  validateApiKeyFormat(key) {
    return key.startsWith('gsk_') && key.length >= 20;
  },
  async validateApiKey(key) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        return { ok: false, error: text };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },
  listModels() {
    return MODELS.map((m) => ({ ...m }));
  },
  defaultModel() {
    return 'llama-3.3-70b-versatile';
  },
  getLanguageModel({ apiKey, modelId }) {
    return createGroq({ apiKey })(modelId);
  },
  getModelPricing(modelId) {
    return MODELS.find((m) => m.id === modelId)?.pricing;
  },
};
