import type { Command } from '../../commands.js'
import { hasWeoCredential } from '../../services/weo/auth.js'
import { isEnvTruthy } from '../../utils/envUtils.js'

export default () =>
  ({
    type: 'local-jsx',
    name: 'login',
    description: hasWeoCredential()
      ? 'Switch Weo account'
      : 'Sign in to Weo',
    isEnabled: () => !isEnvTruthy(process.env.DISABLE_LOGIN_COMMAND),
    load: () => import('./login.js'),
  }) satisfies Command
