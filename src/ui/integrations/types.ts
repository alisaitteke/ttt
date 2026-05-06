/** Integrations with a working adapter (API key storage, validation). */
export type IntegrationAdapterId = 'giphy';

/** Includes catalog-only entries shown in settings (e.g. coming soon). */
export type IntegrationId =
  | IntegrationAdapterId
  | 'homeassistant'
  | 'pexels'
  | 'shutterstock';

export interface IntegrationAdapter {
  id: IntegrationAdapterId;
  label: string;
  apiKeyHelpUrl: string;
  validateApiKeyFormat(key: string): boolean;
  getEffectiveKey(): Promise<string | undefined>;
  /** Called after key saved or removed from the credential store (not when only env provides the key). */
  onCredentialChanged?(): void;
}
