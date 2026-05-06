import type { Provider } from '@ttt/core/types.js';

/**
 * Scaffold for the Figma provider.
 *
 * Figma is not locally scriptable like Adobe CC — integration will likely
 * use the Figma REST API (token-based) and/or a plugin bridge. Implementation
 * tracked by the TTT Multi-provider plan.
 */
const figmaProvider: Provider = {
  id: 'figma',
  displayName: 'Figma',
  register() {
    // no-op until Figma tools are implemented
  },
};

export default figmaProvider;
