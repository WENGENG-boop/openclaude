import type { Command } from '../../commands.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'Manage API provider profiles',
  // Weo is a single-provider terminal: provider switching is disabled and the
  // provider is force-locked to the Weo platform (see src/services/weo/lock.ts).
  isEnabled: () => false,
  isHidden: true,
  load: () => import('./provider.js'),
} satisfies Command

export default provider
