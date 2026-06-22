import * as React from 'react'
import { Box, Text, useInput } from '../../ink.js'
import {
  loginWithPastedToken,
  openWeoVerification,
  pollWeoDeviceToken,
  requestWeoDeviceCode,
  type WeoDeviceCode,
} from '../../services/weo/auth.js'
import { clearWeoAccountCache } from '../../services/weo/account.js'

export type WeoLoginResult = { type: 'success' } | { type: 'cancel' }

type Phase = 'starting' | 'awaiting' | 'success' | 'error'

/**
 * Weo platform login. Runs the device flow against the Weo auth bridge and
 * opens the platform's own login page in the browser; also accepts a token
 * pasted from the web panel as a fallback. Nothing here touches Anthropic.
 */
export function WeoLoginFlow(props: {
  onDone: (result: WeoLoginResult) => void
}): React.ReactNode {
  const [phase, setPhase] = React.useState<Phase>('starting')
  const [code, setCode] = React.useState<WeoDeviceCode | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pasted, setPasted] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    ;(async () => {
      try {
        const deviceCode = await requestWeoDeviceCode()
        if (cancelled) return
        setCode(deviceCode)
        setPhase('awaiting')
        void openWeoVerification(deviceCode)
        await pollWeoDeviceToken(deviceCode, controller.signal)
        if (cancelled) return
        clearWeoAccountCache()
        setPhase('success')
        props.onDone({ type: 'success' })
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useInput((input, key) => {
    if (key.escape) {
      props.onDone({ type: 'cancel' })
      return
    }
    if (key.return) {
      const token = pasted.trim()
      if (token) {
        try {
          loginWithPastedToken(token)
          clearWeoAccountCache()
          setPhase('success')
          props.onDone({ type: 'success' })
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
          setPhase('error')
        }
      }
      return
    }
    if (key.backspace || key.delete) {
      setPasted(p => p.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta) {
      setPasted(p => p + input)
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Sign in to Weo</Text>
      {phase === 'starting' && <Text>Starting sign-in…</Text>}
      {phase === 'awaiting' && code && (
        <Box flexDirection="column">
          <Text>Open this page in your browser and approve the request:</Text>
          <Text bold>{code.verificationUri}</Text>
          <Text>
            Your code: <Text bold>{code.userCode}</Text>
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>
              …or paste a token from the Weo panel and press Enter:
            </Text>
            <Text>{pasted ? '*'.repeat(pasted.length) : ' '}</Text>
          </Box>
        </Box>
      )}
      {phase === 'success' && <Text color="green">Signed in to Weo.</Text>}
      {phase === 'error' && (
        <Box flexDirection="column">
          <Text color="red">Sign-in failed: {error}</Text>
          <Text dimColor>
            Paste a token from the Weo panel and press Enter, or press Esc to
            cancel.
          </Text>
          <Text>{pasted ? '*'.repeat(pasted.length) : ' '}</Text>
        </Box>
      )}
    </Box>
  )
}
