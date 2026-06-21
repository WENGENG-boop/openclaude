import type { LocalCommandCall } from '../../types/command.js'
import { fetchWeoAccount, formatQuotaUsd } from '../../services/weo/account.js'
import { hasWeoCredential } from '../../services/weo/auth.js'

export const call: LocalCommandCall = async () => {
  if (!hasWeoCredential()) {
    return {
      type: 'text',
      value: 'Not signed in to Weo. Run /login to connect your account.',
    }
  }

  const account = await fetchWeoAccount({ force: true })
  if (!account) {
    return {
      type: 'text',
      value:
        'Could not reach the Weo platform to read your balance. Try again shortly.',
    }
  }

  const remaining = formatQuotaUsd(account.quotaRemaining, account.unitPerDollar)
  const used = formatQuotaUsd(account.quotaUsed, account.unitPerDollar)
  const lines = [
    account.username ? `Account:   ${account.username}` : null,
    account.group ? `Group:     ${account.group}` : null,
    `Remaining: ${remaining}`,
    `Used:      ${used}`,
    account.requestCount !== undefined
      ? `Requests:  ${account.requestCount}`
      : null,
  ].filter((l): l is string => l !== null)

  return { type: 'text', value: lines.join('\n') }
}
