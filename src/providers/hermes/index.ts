import type { Provider } from '@ttt/core/types.js';

/**
 * Scaffold for the Hermes provider.
 * Implementation details to be confirmed in the TTT Multi-provider plan.
 */
const hermesProvider: Provider = {
  id: 'hermes',
  displayName: 'Hermes',
  register() {
    // no-op until Hermes tools are implemented
  },
};

export default hermesProvider;
