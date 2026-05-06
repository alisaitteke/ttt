import { invalidateDesignToolsListCache } from '@ttt/ui/providers/design-tool-detection.js';
import { getGiphyApiKey } from '@ttt/ui/integrations/giphy-key.js';
import type { IntegrationAdapter } from '@ttt/ui/integrations/types.js';

const MAX_KEY_LEN = 256;

export const giphyIntegrationAdapter: IntegrationAdapter = {
  id: 'giphy',
  label: 'GIPHY',
  apiKeyHelpUrl: 'https://developers.giphy.com/dashboard/',
  validateApiKeyFormat(key: string): boolean {
    const t = key.trim();
    return t.length > 0 && t.length <= MAX_KEY_LEN;
  },
  getEffectiveKey: getGiphyApiKey,
  onCredentialChanged(): void {
    invalidateDesignToolsListCache();
  },
};
