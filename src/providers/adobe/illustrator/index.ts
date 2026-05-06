import type { Provider } from '@ttt/core/types.js';

/**
 * Scaffold for the Adobe Illustrator provider.
 * Tools to be implemented in TTT Multi-provider plan.
 */
const illustratorProvider: Provider = {
  id: 'illustrator',
  displayName: 'Adobe Illustrator',
  register() {
    // no-op until Illustrator tools are implemented
  },
};

export default illustratorProvider;
