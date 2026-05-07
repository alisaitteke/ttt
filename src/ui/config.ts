import { kvGet, kvSet } from '@ttt/ui/store/kv.js';
import {
  deleteProviderCredentialSecret,
  getProviderCredentialSecret,
  setProviderCredentialSecret,
} from '@ttt/ui/store/credentials.js';

export type ProviderId = 'anthropic' | 'openai' | 'openrouter' | 'google' | 'groq';

export interface ProviderConfig {
  apiKey?: string;
  defaultModel?: string;
}

export interface UIConfig {
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  activeProvider: ProviderId;
  activeModel: string;
}

const PROVIDER_ENV_KEYS: Record<ProviderId, string> = {
  anthropic: 'TTT_ANTHROPIC_API_KEY',
  openai: 'TTT_OPENAI_API_KEY',
  openrouter: 'TTT_OPENROUTER_API_KEY',
  google: 'TTT_GOOGLE_API_KEY',
  groq: 'TTT_GROQ_API_KEY',
};

const KV_KEY = 'config';

const DEFAULT_CONFIG: UIConfig = {
  providers: {},
  activeProvider: 'anthropic',
  activeModel: 'claude-sonnet-4-5',
};

function stripApiKeysFromConfig(cfg: UIConfig): UIConfig {
  const providers: UIConfig['providers'] = {};
  for (const [id, p] of Object.entries(cfg.providers)) {
    if (!p) continue;
    const copy = { ...p };
    delete copy.apiKey;
    providers[id as ProviderId] = copy;
  }
  return { ...cfg, providers };
}

function getProviderApiKeyFromEnv(id: ProviderId): string | undefined {
  const name = PROVIDER_ENV_KEYS[id];
  const v = name ? process.env[name]?.trim() : undefined;
  return v || undefined;
}

export function loadConfig(): UIConfig {
  const stored = kvGet<UIConfig>(KV_KEY);
  if (!stored) return { ...DEFAULT_CONFIG, providers: {} };
  const merged: UIConfig = {
    ...DEFAULT_CONFIG,
    ...stored,
    providers: { ...stored.providers },
  };
  return stripApiKeysFromConfig(merged);
}

export function saveConfig(patch: Partial<UIConfig>): UIConfig {
  const current = loadConfig();
  const next: UIConfig = {
    ...current,
    ...patch,
    providers: { ...current.providers, ...(patch.providers ?? {}) },
  };
  const persisted = stripApiKeysFromConfig(next);
  kvSet(KV_KEY, persisted);
  return persisted;
}

export async function setProviderConfig(id: ProviderId, patch: ProviderConfig): Promise<UIConfig> {
  const current = loadConfig();
  if ('apiKey' in patch) {
    if (patch.apiKey === undefined) {
      await deleteProviderCredentialSecret(id);
    } else {
      await setProviderCredentialSecret(id, patch.apiKey);
    }
  }
  const merged = { ...current.providers[id], ...patch };
  delete merged.apiKey;
  return saveConfig({
    providers: { ...current.providers, [id]: merged },
  });
}

export function getProviderConfig(id: ProviderId): ProviderConfig | undefined {
  return loadConfig().providers[id];
}

export async function getProviderApiKey(id: ProviderId): Promise<string | undefined> {
  const fromEnv = getProviderApiKeyFromEnv(id);
  if (fromEnv) return fromEnv;
  const fromStore = await getProviderCredentialSecret(id);
  return fromStore ?? undefined;
}

export function maskApiKey(apiKey?: string): string | null {
  if (!apiKey) return null;
  if (apiKey.length <= 12) return '***';
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
}
