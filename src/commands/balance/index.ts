import type { Command } from '../../commands.js'

const balance = {
  type: 'local',
  name: 'balance',
  description: 'Show your Weo account and remaining quota',
  supportsNonInteractive: true,
  load: () => import('./balance.js'),
} satisfies Command

export default balance
