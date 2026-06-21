/**
 * Weo platform configuration — single source of truth for the (only) backend
 * this terminal talks to. Weo is the user's own New-API-based platform; every
 * request and every login flow targets it and nothing else.
 *
 * All values are overridable via environment variables so the same build can
 * point at a staging deployment without code changes.
 */

/**
 * Root base URL for the Anthropic-compatible relay. The Anthropic SDK appends
 * `/v1/messages` itself, so this MUST be the host root (no trailing `/v1`).
 * Final request URL = `${WEO_BASE_URL}/v1/messages`.
 */
export function getWeoBaseUrl(): string {
  return stripTrailingSlash(process.env.WEO_BASE_URL || 'https://api.weo.asia')
}

/**
 * Base URL for the Weo auth bridge (device-flow login + account/quota sync).
 * Deployed alongside New API on the VPS, typically reverse-proxied under the
 * same host. Defaults to the platform host.
 */
export function getWeoBridgeUrl(): string {
  return stripTrailingSlash(
    process.env.WEO_BRIDGE_URL || getWeoBaseUrl(),
  )
}

/** Human-facing platform/website URL (panel, docs, token management). */
export function getWeoWebUrl(): string {
  return stripTrailingSlash(process.env.WEO_WEB_URL || getWeoBaseUrl())
}

/** Device-flow endpoints on the bridge. */
export function getWeoDeviceCodeUrl(): string {
  return `${getWeoBridgeUrl()}/oauth/device/code`
}

export function getWeoDeviceTokenUrl(): string {
  return `${getWeoBridgeUrl()}/oauth/device/token`
}

/** Normalized account/quota endpoint on the bridge. */
export function getWeoAccountUrl(): string {
  return `${getWeoBridgeUrl()}/weo/account`
}

/** OpenAI/Anthropic-style model listing exposed by the relay. */
export function getWeoModelsUrl(): string {
  return `${getWeoBaseUrl()}/v1/models`
}

/**
 * Default model id used when none is configured. Must be a model the New API
 * relay maps. Overridable with WEO_MODEL.
 */
export function getWeoDefaultModel(): string {
  return process.env.WEO_MODEL || 'claude-sonnet-4-6'
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}
