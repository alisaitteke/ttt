import { giphyIntegrationAdapter } from '@ttt/ui/integrations/adapters/giphy.js';
import type { IntegrationAdapter } from '@ttt/ui/integrations/types.js';

/**
 * All UI-backed integrations. Order is stable for API responses; add new entries
 * by creating an adapter module and registering it here.
 */
const integrations: IntegrationAdapter[] = [giphyIntegrationAdapter];

const byId = new Map<string, IntegrationAdapter>(
  integrations.map((a) => [a.id, a])
);

/** Shown in settings only; no credential endpoints until an adapter exists. */
export const COMING_SOON_INTEGRATIONS = [
  {
    id: 'homeassistant' as const,
    label: 'Home Assistant',
    apiKeyHelpUrl: 'https://www.home-assistant.io/',
  },
  {
    id: 'pexels' as const,
    label: 'Pexels',
    apiKeyHelpUrl: 'https://www.pexels.com/api/',
  },
  {
    id: 'shutterstock' as const,
    label: 'Shutterstock',
    apiKeyHelpUrl: 'https://www.shutterstock.com/developers/',
  },
] as const;

export function listComingSoonIntegrations(): readonly (typeof COMING_SOON_INTEGRATIONS)[number][] {
  return COMING_SOON_INTEGRATIONS;
}

export function getIntegration(id: string): IntegrationAdapter | undefined {
  return byId.get(id);
}

export function listIntegrations(): IntegrationAdapter[] {
  return integrations.slice();
}

export type { IntegrationAdapter, IntegrationId } from '@ttt/ui/integrations/types.js';
