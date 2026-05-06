import { anthropicAdapter } from '@ttt/ui/providers/anthropic.js';
import { googleAdapter } from '@ttt/ui/providers/google.js';
import { groqAdapter } from '@ttt/ui/providers/groq.js';
import { openaiAdapter } from '@ttt/ui/providers/openai.js';
import { openrouterAdapter } from '@ttt/ui/providers/openrouter.js';
import type { ProviderAdapter, ProviderId } from '@ttt/ui/providers/types.js';

export const providers: Record<ProviderId, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  openrouter: openrouterAdapter,
  google: googleAdapter,
  groq: groqAdapter,
};

export function getProvider(id: string): ProviderAdapter | undefined {
  return providers[id as ProviderId];
}

export function listProviders(): ProviderAdapter[] {
  return Object.values(providers);
}

export type { ModelPricing, ProviderAdapter, ProviderId, UsageCost } from '@ttt/ui/providers/types.js';
