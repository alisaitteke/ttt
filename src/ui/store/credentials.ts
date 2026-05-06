import keytar from 'keytar';

/** OS credential store namespace (Keychain / Credential Manager / Secret Service). */
export const PROVIDER_CREDENTIAL_SERVICE = 'ttt';

export function providerCredentialAccount(providerId: string): string {
  return `provider:${providerId}`;
}

export async function setProviderCredentialSecret(
  providerId: string,
  secret: string
): Promise<void> {
  await keytar.setPassword(PROVIDER_CREDENTIAL_SERVICE, providerCredentialAccount(providerId), secret);
}

export async function getProviderCredentialSecret(providerId: string): Promise<string | null> {
  return keytar.getPassword(PROVIDER_CREDENTIAL_SERVICE, providerCredentialAccount(providerId));
}

export async function deleteProviderCredentialSecret(providerId: string): Promise<boolean> {
  return keytar.deletePassword(PROVIDER_CREDENTIAL_SERVICE, providerCredentialAccount(providerId));
}
