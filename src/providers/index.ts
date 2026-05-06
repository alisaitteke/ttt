import type { Provider } from '../core/types.js';
import photoshopProvider from './adobe/photoshop/index.js';
import illustratorProvider from './adobe/illustrator/index.js';
import afterEffectsProvider from './adobe/after-effects/index.js';
import figmaProvider from './figma/index.js';
import openclawProvider from './openclaw/index.js';
import hermesProvider from './hermes/index.js';
import dockerProvider from './docker/index.js';
import whatsappToolsProvider from './whatsapp/index.js';

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
];
