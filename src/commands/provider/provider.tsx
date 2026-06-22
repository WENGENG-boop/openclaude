import * as React from 'react'

import type {
  LocalJSXCommandCall,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { COMMON_HELP_ARGS, COMMON_INFO_ARGS } from '../../constants/xml.js'
import TextInput from '../../components/TextInput.js'
import {
  Select,
  type OptionWithDescription,
} from '../../components/CustomSelect/index.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Text } from '../../ink.js'
import {
  getWeoBaseUrl,
  getWeoDefaultModel,
  getWeoWebUrl,
} from '../../constants/weo.js'
import {
  clearWeoAuth,
  getStoredWeoAuth,
  getWeoToken,
  loginWithPastedToken,
} from '../../services/weo/auth.js'
import { clearWeoAccountCache } from '../../services/weo/account.js'
import { forceWeoProvider } from '../../services/weo/lock.js'
import { openBrowser } from '../../utils/browser.js'

/**
 * `/provider` for the Weo build.
 *
 * Weo is a single-platform terminal: every request goes to the Anthropic-
 * compatible relay at WEO_BASE_URL. There is no provider switching here.
 * Instead this panel lets the user manage the one credential that matters:
 *  - see the current sign-in / API-key status
 *  - paste / change the Weo API key (token from the web panel)
 *  - open the Weo website (https://api.weo.asia) to register or copy a key
 *  - clear the stored credential
 */

type Step = { name: 'menu' } | { name: 'enter-key' }

type MenuChoice = 'set-key' | 'open-website' | 'clear' | 'cancel'

/** Mask a token for display: keep the last 4 chars, redact the rest. */
export function maskToken(token: string): string {
  const trimmed = token.trim()
  if (trimmed.length <= 4) return '••••'
  return `••••${trimmed.slice(-4)}`
}

type WeoStatus = {
  configured: boolean
  source: 'env' | 'stored' | 'none'
  masked: string
  username?: string
}

function readWeoStatus(): WeoStatus {
  const envKey = process.env.WEO_API_KEY || process.env.ANTHROPIC_API_KEY
  const stored = getStoredWeoAuth()
  const token = getWeoToken()

  if (!token) {
    return { configured: false, source: 'none', masked: '(not set)' }
  }

  return {
    configured: true,
    source: envKey ? 'env' : 'stored',
    masked: maskToken(token),
    username: stored?.username,
  }
}

function StatusLines({ status }: { status: WeoStatus }): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text dimColor>
        Platform: {getWeoBaseUrl()} · model {getWeoDefaultModel()}
      </Text>
      {status.configured ? (
        <Text dimColor>
          API key: {status.masked}
          {status.source === 'env' ? ' (from environment)' : ''}
          {status.username ? ` · ${status.username}` : ''}
        </Text>
      ) : (
        <Text color="warning">
          No API key configured. Set one below or sign in with /login.
        </Text>
      )}
    </Box>
  )
}

function ProviderMenu({
  onChoose,
  onCancel,
}: {
  onChoose: (choice: MenuChoice) => void
  onCancel: () => void
}): React.ReactNode {
  const status = readWeoStatus()
  const options: OptionWithDescription<MenuChoice>[] = [
    {
      label: status.configured ? 'Change API key' : 'Set API key',
      value: 'set-key',
      description: 'Paste a token created in the Weo web panel',
    },
    {
      label: 'Open Weo website',
      value: 'open-website',
      description: `Open ${getWeoWebUrl()} to register or copy an API key`,
    },
  ]

  if (status.configured && status.source === 'stored') {
    options.push({
      label: 'Clear stored API key',
      value: 'clear',
      description: 'Remove the saved Weo credential from secure storage',
    })
  }

  return (
    <Dialog
      title="Weo provider"
      subtitle={status.configured ? 'Signed in' : 'Not signed in'}
      onCancel={onCancel}
    >
      <Box flexDirection="column" gap={1}>
        <StatusLines status={status} />
        <Select
          options={options}
          inlineDescriptions
          visibleOptionCount={options.length}
          onChange={onChoose}
          onCancel={onCancel}
        />
      </Box>
    </Dialog>
  )
}

function ApiKeyEntry({
  onSubmit,
  onCancel,
}: {
  onSubmit: (token: string) => void
  onCancel: () => void
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const [value, setValue] = React.useState('')
  const [cursorOffset, setCursorOffset] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)

  const inputColumns = Math.max(30, columns - 6)

  const handleSubmit = React.useCallback(
    (next: string) => {
      if (next.trim().length === 0) {
        setError('Enter the API key from your Weo panel.')
        return
      }
      setError(null)
      onSubmit(next.trim())
    },
    [onSubmit],
  )

  return (
    <Dialog title="Set Weo API key" onCancel={onCancel}>
      <Box flexDirection="column" gap={1}>
        <Text>
          Paste the API key from {getWeoWebUrl()} and press Enter. It is stored
          securely and used for every request.
        </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="sk-..."
          mask="*"
          columns={inputColumns}
          cursorOffset={cursorOffset}
          onChangeCursorOffset={setCursorOffset}
          focus
          showCursor
        />
        {error ? <Text color="error">{error}</Text> : null}
      </Box>
    </Dialog>
  )
}

export function WeoProviderPanel({
  onDone,
  onChangeAPIKey,
}: {
  onDone: LocalJSXCommandOnDone
  onChangeAPIKey?: () => void
}): React.ReactNode {
  const [step, setStep] = React.useState<Step>({ name: 'menu' })

  const handleSetKey = React.useCallback(
    (token: string) => {
      try {
        loginWithPastedToken(token)
        clearWeoAccountCache()
        // Re-apply the lock so ANTHROPIC_API_KEY reflects the new token, then
        // reset the cached client so the next request uses it immediately.
        forceWeoProvider()
        onChangeAPIKey?.()
        onDone(`Weo API key updated (${maskToken(token)}).`, {
          display: 'system',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        onDone(`Failed to save API key: ${message}`, { display: 'system' })
      }
    },
    [onChangeAPIKey, onDone],
  )

  const handleOpenWebsite = React.useCallback(async () => {
    const url = getWeoWebUrl()
    const opened = await openBrowser(url)
    onDone(
      opened
        ? `Opened ${url} in your browser.`
        : `Could not open a browser automatically. Visit ${url} manually.`,
      { display: 'system' },
    )
  }, [onDone])

  const handleClear = React.useCallback(() => {
    clearWeoAuth()
    clearWeoAccountCache()
    forceWeoProvider()
    onChangeAPIKey?.()
    onDone('Cleared the stored Weo API key.', { display: 'system' })
  }, [onChangeAPIKey, onDone])

  if (step.name === 'enter-key') {
    return (
      <ApiKeyEntry
        onSubmit={handleSetKey}
        onCancel={() => setStep({ name: 'menu' })}
      />
    )
  }

  return (
    <ProviderMenu
      onChoose={choice => {
        if (choice === 'set-key') {
          setStep({ name: 'enter-key' })
        } else if (choice === 'open-website') {
          void handleOpenWebsite()
        } else if (choice === 'clear') {
          handleClear()
        } else {
          onDone()
        }
      }}
      onCancel={() => onDone()}
    />
  )
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const trimmedArgs = args?.trim().toLowerCase() ?? ''

  if (
    COMMON_HELP_ARGS.includes(trimmedArgs) ||
    COMMON_INFO_ARGS.includes(trimmedArgs) ||
    trimmedArgs === 'help' ||
    trimmedArgs === '--help' ||
    trimmedArgs === '-h'
  ) {
    onDone(
      'Run /provider to view your Weo sign-in status, set or change your API key, or open the Weo website.',
      { display: 'system' },
    )
    return
  }

  return (
    <WeoProviderPanel
      onDone={onDone}
      onChangeAPIKey={context.onChangeAPIKey}
    />
  )
}
