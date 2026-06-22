import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { ProgressBar } from '../design-system/ProgressBar.js'
import {
  fetchWeoAccount,
  formatQuotaUsd,
  type WeoAccount,
} from '../../services/weo/account.js'
import { hasWeoCredential } from '../../services/weo/auth.js'
import {
  formatDuration,
  formatTokens,
  getWeoSessionUsage,
  type WeoSessionUsage,
} from '../../services/weo/usage.js'

/**
 * Weo usage panel (/usage). Shows the platform quota (total / used / remaining)
 * and this session's per-model usage ranking. Replaces the Anthropic plan-usage
 * view, which is meaningless in the single-provider Weo build.
 */
export function WeoUsage(): React.ReactNode {
  const [account, setAccount] = React.useState<WeoAccount | null>(null)
  const [loadingAccount, setLoadingAccount] = React.useState(true)
  const session: WeoSessionUsage = getWeoSessionUsage()

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!hasWeoCredential()) {
        if (!cancelled) setLoadingAccount(false)
        return
      }
      const acc = await fetchWeoAccount({ force: true })
      if (!cancelled) {
        setAccount(acc)
        setLoadingAccount(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Box flexDirection="column" gap={1} width="100%">
      <Text bold>Weo usage</Text>

      {/* Platform quota */}
      <Box flexDirection="column">
        <Text bold>Account quota</Text>
        {loadingAccount && <Text dimColor>Loading…</Text>}
        {!loadingAccount && !account && (
          <Text dimColor>
            {hasWeoCredential()
              ? 'Could not reach the Weo platform.'
              : 'Not signed in. Run /login.'}
          </Text>
        )}
        {account && <QuotaSummary account={account} />}
      </Box>

      {/* This session */}
      <Box flexDirection="column">
        <Text bold>This session</Text>
        <Text>
          Spent {formatUsd(session.totalCostUSD)} · {formatTokens(session.totalTokens)} tokens
          {' · '}
          {formatDuration(session.durationMs)}
        </Text>
      </Box>

      {/* Per-model ranking */}
      <Box flexDirection="column">
        <Text bold>Models this session (most used first)</Text>
        {session.models.length === 0 && <Text dimColor>No model calls yet.</Text>}
        {session.models.map((m, i) => (
          <Text key={m.model}>
            {`#${i + 1} `}
            <Text bold>{m.model}</Text>
            {`  ${formatTokens(m.totalTokens)} tok`}
            {`  (${formatTokens(m.inputTokens)} in / ${formatTokens(m.outputTokens)} out)`}
            {`  ${formatUsd(m.costUSD)}`}
          </Text>
        ))}
      </Box>
    </Box>
  )
}

function QuotaSummary({ account }: { account: WeoAccount }): React.ReactNode {
  const total = account.quotaRemaining + account.quotaUsed
  const usedRatio = total > 0 ? account.quotaUsed / total : 0
  return (
    <Box flexDirection="column">
      <Text>
        Total {formatQuotaUsd(total, account.unitPerDollar)} · Used{' '}
        {formatQuotaUsd(account.quotaUsed, account.unitPerDollar)} · Remaining{' '}
        <Text bold>{formatQuotaUsd(account.quotaRemaining, account.unitPerDollar)}</Text>
      </Text>
      <Box flexDirection="row" gap={1}>
        <ProgressBar
          ratio={usedRatio}
          width={40}
          fillColor="rate_limit_fill"
          emptyColor="rate_limit_empty"
        />
        <Text>{Math.round(usedRatio * 100)}% used</Text>
      </Box>
      {account.username && <Text dimColor>Account: {account.username}</Text>}
    </Box>
  )
}

function formatUsd(n: number): string {
  return n >= 0.5 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`
}
