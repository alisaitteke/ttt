import type { Provider } from '@ttt/core/types.js';
import photoshopProvider from '@ttt/providers/adobe/photoshop/index.js';
import illustratorProvider from '@ttt/providers/adobe/illustrator/index.js';
import afterEffectsProvider from '@ttt/providers/adobe/after-effects/index.js';
import figmaProvider from '@ttt/providers/figma/index.js';
import openclawProvider from '@ttt/providers/openclaw/index.js';
import hermesProvider from '@ttt/providers/hermes/index.js';
import dockerProvider from '@ttt/providers/docker/index.js';
import whatsappToolsProvider from '@ttt/providers/whatsapp/index.js';
import giphyProvider from '@ttt/providers/giphy/index.js';

/**
 * The full list of providers known to TTT.
 *
 * Order is significant only for log output. Empty (no-op) providers register
 * zero tools — they're listed so that adding a new design tool is purely a
 * matter of dropping a folder and listing it here.
 */
export const providers: Provider[] = [
  photoshopProvider,
  illustratorProvider,
  afterEffectsProvider,
  figmaProvider,
  openclawProvider,
  hermesProvider,
  dockerProvider,
  whatsappToolsProvider,
  giphyProvider,
];
