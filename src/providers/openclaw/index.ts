import type { Provider } from '@ttt/core/types.js';

/**
 * Scaffold for the OpenClaw provider.
 *
 * OpenClaw exposes a local REST API (with an explicit `?agent=true` mode for
 * automation). Integration tracked by the TTT Multi-provider plan.
 */
const openclawProvider: Provider = {
  id: 'openclaw',
  displayName: 'OpenClaw',
  register() {
    // no-op until OpenClaw tools are implemented
  },
};

export default openclawProvider;
