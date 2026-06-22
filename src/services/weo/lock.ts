/**
 * Provider lock — forces every request through the Weo platform.
 *
 * Weo is a single-provider terminal: regardless of any CLAUDE_CODE_USE_* /
 * OPENAI_* / vendor env vars a user might have inherited, all traffic must go
 * to the Anthropic-compatible relay at WEO_BASE_URL using the stored Weo token.
 *
 * `forceWeoProvider()` normalizes the environment so the default Anthropic
 * client path in getAnthropicClient() is taken with the Weo base URL + token.
 * It is intentionally idempotent and cheap enough to call on every client
 * creation as well as once at startup.
 */
import { getWeoBaseUrl, getWeoDefaultModel } from '../../constants/weo.js'
import { getWeoToken } from './auth.js'

/** Routing env vars from other providers that must never take effect. */
const COMPETING_ROUTE_ENV = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_MISTRAL',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_API_KEY',
  // Env-only vendor routes resolved by resolveEnvOnlyProviderRouteId().
  'MINIMAX_API_KEY',
  'FIREWORKS_API_KEY',
  'XAI_API_KEY',
  'NEARAI_API_KEY',
  'VENICE_API_KEY',
  'MIMO_API_KEY',
  // First-party Anthropic OAuth / staging toggles
  'USE_STAGING_OAUTH',
] as const

/**
 * Normalize the process environment so the single Weo provider is used.
 * Returns true if a usable credential is present.
 */
export function forceWeoProvider(): boolean {
  for (const key of COMPETING_ROUTE_ENV) {
    if (process.env[key] !== undefined) delete process.env[key]
  }
  // The Anthropic SDK appends `/v1/messages`; WEO_BASE_URL is the host root.
  process.env.ANTHROPIC_BASE_URL = getWeoBaseUrl()

  // Never let the Anthropic first-party OAuth path engage.
  if (process.env.USER_TYPE === 'ant') delete process.env.USER_TYPE

  const token = getWeoToken()
  if (token) {
    // Used as `x-api-key` by the Anthropic SDK against the relay.
    process.env.ANTHROPIC_API_KEY = token
  }

  if (!process.env.ANTHROPIC_MODEL) {
    process.env.ANTHROPIC_MODEL = getWeoDefaultModel()
  }

  return Boolean(token)
}
