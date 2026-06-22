import type { Command } from '../../commands.js'

const provider = {
  type: 'local-jsx',
  name: 'provider',
  description: 'View Weo sign-in status, set/change the API key, or open the Weo website',
  // Weo is a single-platform terminal: there is no provider switching. /provider
  // manages the one Weo credential (see src/commands/provider/provider.tsx).
  isEnabled: () => true,
  load: () => import('./provider.js'),
} satisfies Command

export default provider
