/**
 * Weo platform authentication.
 *
 * Every login flow here targets the user's own New-API platform (api.weo.asia)
 * and nothing else. There is no Anthropic / claude.ai login in this build.
 *
 * Two login modes are supported:
 *  - Device flow via the Weo auth bridge (preferred): open the platform's own
 *    login page in a browser, then poll the bridge for the issued token.
 *  - Paste token (fallback): the user creates a token in the Weo web panel and
 *    pastes it directly.
 *
 * The issued/pasted token is persisted in OS secure storage and surfaced as the
 * Anthropic `x-api-key` by the provider lock (src/services/weo/lock.ts).
 */
import { getSecureStorage, type SecureStorageData } from '../../utils/secureStorage/index.js'
import {
  getWeoDeviceCodeUrl,
  getWeoDeviceTokenUrl,
} from '../../constants/weo.js'
import { openBrowser } from '../../utils/browser.js'

export type WeoAuth = NonNullable<SecureStorageData['weoAuth']>

/** Read the stored Weo credentials, if any. */
export function getStoredWeoAuth(): WeoAuth | null {
  try {
    const data = getSecureStorage().read()
    return data?.weoAuth ?? null
  } catch {
    return null
  }
}

/** Persist Weo credentials to secure storage. */
export function saveWeoAuth(auth: WeoAuth): { success: boolean; warning?: string } {
  const storage = getSecureStorage()
  const data = storage.read() ?? {}
  return storage.update({ ...data, weoAuth: auth })
}

/** Remove stored Weo credentials (logout). */
export function clearWeoAuth(): void {
  const storage = getSecureStorage()
  const data = storage.read()
  if (!data?.weoAuth) return
  const { weoAuth: _omit, ...rest } = data
  storage.update(rest)
}

/**
 * Resolve the active Weo token for outbound requests. Prefers an explicit
 * WEO_API_KEY env (CI / headless), then the stored login token.
 */
export function getWeoToken(): string | undefined {
  const envKey = process.env.WEO_API_KEY || process.env.ANTHROPIC_API_KEY
  if (envKey) return envKey
  return getStoredWeoAuth()?.token
}

/** Whether a usable Weo credential is available without prompting login. */
export function hasWeoCredential(): boolean {
  return Boolean(getWeoToken())
}

// ── Device flow ────────────────────────────────────────────────────────────

export interface WeoDeviceCode {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  interval: number
  expiresIn: number
}

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  interval?: number
  expires_in?: number
}

interface DeviceTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: number; username?: string }
  error?: string
}

/** Request a device/user code from the Weo bridge and open the browser. */
export async function requestWeoDeviceCode(): Promise<WeoDeviceCode> {
  const res = await fetch(getWeoDeviceCodeUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client: 'weo-cli' }),
  })
  if (!res.ok) {
    throw new Error(
      `Weo login could not start (HTTP ${res.status}). Check WEO_BRIDGE_URL or use paste-token login.`,
    )
  }
  const json = (await res.json()) as DeviceCodeResponse
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error('Weo login returned an unexpected response.')
  }
  return {
    deviceCode: json.device_code,
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    verificationUriComplete: json.verification_uri_complete,
    interval: json.interval && json.interval > 0 ? json.interval : 5,
    expiresIn: json.expires_in && json.expires_in > 0 ? json.expires_in : 600,
  }
}

/** Best-effort open the Weo platform login/approval page in the browser. */
export async function openWeoVerification(code: WeoDeviceCode): Promise<void> {
  const url = code.verificationUriComplete || code.verificationUri
  try {
    await openBrowser(url)
  } catch {
    // Non-fatal: the URL + user code are shown in the terminal for manual entry.
  }
}

/**
 * Poll the bridge until the user approves on the platform, then persist and
 * return the credentials. Honors `authorization_pending` / `slow_down` per the
 * OAuth device-flow spec.
 */
export async function pollWeoDeviceToken(
  code: WeoDeviceCode,
  signal?: AbortSignal,
): Promise<WeoAuth> {
  let intervalMs = code.interval * 1000
  const deadline = Date.now() + code.expiresIn * 1000

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error('Weo login cancelled.')
    await delay(intervalMs, signal)

    const res = await fetch(getWeoDeviceTokenUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        device_code: code.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    let json: DeviceTokenResponse = {}
    try {
      json = (await res.json()) as DeviceTokenResponse
    } catch {
      // Treat malformed bodies as pending and keep polling within the deadline.
    }

    if (res.ok && json.access_token) {
      const auth: WeoAuth = {
        token: json.access_token,
        refreshToken: json.refresh_token,
        expiresAt: json.expires_in
          ? Date.now() + json.expires_in * 1000
          : undefined,
        userId: json.user?.id,
        username: json.user?.username,
      }
      saveWeoAuth(auth)
      return auth
    }

    switch (json.error) {
      case 'authorization_pending':
        break
      case 'slow_down':
        intervalMs += 5000
        break
      case 'access_denied':
        throw new Error('Weo login was denied.')
      case 'expired_token':
        throw new Error('Weo login code expired. Please try again.')
      default:
        if (!res.ok && res.status >= 500) break // transient; keep polling
    }
  }
  throw new Error('Weo login timed out. Please try again.')
}

/** Store a token pasted from the Weo web panel (fallback login). */
export function loginWithPastedToken(token: string): WeoAuth {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('Empty token.')
  const auth: WeoAuth = { token: trimmed }
  saveWeoAuth(auth)
  return auth
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(new Error('Weo login cancelled.'))
      },
      { once: true },
    )
  })
}
