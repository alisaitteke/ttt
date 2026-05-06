import { getIntegrationCredentialSecret } from '@ttt/ui/store/credentials.js';

/** Env wins over OS credential store (Keychain / Credential Manager / Secret Service). */
export const TTT_GIPHY_API_KEY_ENV = 'TTT_GIPHY_API_KEY';

export async function getGiphyApiKey(): Promise<string | undefined> {
  const fromEnv = process.env[TTT_GIPHY_API_KEY_ENV]?.trim();
  if (fromEnv) return fromEnv;
  const stored = await getIntegrationCredentialSecret('giphy');
  const t = stored?.trim();
  return t || undefined;
}
