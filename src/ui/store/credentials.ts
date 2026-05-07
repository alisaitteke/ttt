import { kvDelete, kvGet, kvSet } from '@ttt/ui/store/kv.js';

/**
 * Local credential store for provider/integration secrets.
 *
 * Secrets live in the SQLite `kv` table next to the rest of the app's data
 * (`~/.ttt/data.db`). The OS user account already protects that file via
 * filesystem permissions; using a separate OS keychain (Keychain / Credential
 * Manager / Secret Service) only added per-launch authorization prompts —
 * each freshly signed bundled Node binary is treated as a new caller by the
 * macOS Keychain ACL — without meaningfully raising the bar against an
 * attacker that already has the user's session.
 */

const SECRET_KEY_PREFIX = 'secret:';

function providerSecretKey(providerId: string): string {
  return `${SECRET_KEY_PREFIX}provider:${providerId}`;
}

function integrationSecretKey(integrationId: string): string {
  return `${SECRET_KEY_PREFIX}integration:${integrationId}`;
}

function readSecret(key: string): string | null {
  const v = kvGet<string>(key);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function deleteSecret(key: string): boolean {
  const existed = readSecret(key) !== null;
  kvDelete(key);
  return existed;
}

export async function setProviderCredentialSecret(
  providerId: string,
  secret: string
): Promise<void> {
  kvSet(providerSecretKey(providerId), secret);
}

export async function getProviderCredentialSecret(providerId: string): Promise<string | null> {
  return readSecret(providerSecretKey(providerId));
}

export async function deleteProviderCredentialSecret(providerId: string): Promise<boolean> {
  return deleteSecret(providerSecretKey(providerId));
}

export async function setIntegrationCredentialSecret(
  integrationId: string,
  secret: string
): Promise<void> {
  kvSet(integrationSecretKey(integrationId), secret);
}

export async function getIntegrationCredentialSecret(
  integrationId: string
): Promise<string | null> {
  return readSecret(integrationSecretKey(integrationId));
}

export async function deleteIntegrationCredentialSecret(
  integrationId: string
): Promise<boolean> {
  return deleteSecret(integrationSecretKey(integrationId));
}
