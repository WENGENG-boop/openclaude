import type { Command } from '../../commands.js'

const upgrade = {
  type: 'local-jsx',
  name: 'upgrade',
  description: 'Upgrade to Max for higher rate limits and more Opus',
  availability: ['claude-ai'],
  // Weo build: Anthropic-only command, not applicable to the Weo platform.
  isEnabled: () => false,
  isHidden: true,
  load: () => import('./upgrade.js'),
} satisfies Command

export default upgrade
