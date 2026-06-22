/**
 * Weo account & quota sync.
 *
 * Fetches the signed-in user's normalized account info (remaining quota, used
 * quota, request count, group) from the Weo auth bridge, which computes it
 * server-side from New API's `/api/user/self`. Used by the `/balance` command
 * and the status line so users can see their shared-quota balance.
 */
import { getWeoAccountUrl } from '../../constants/weo.js'
import { getWeoToken } from './auth.js'

export interface WeoAccount {
  username?: string
  group?: string
  /** Remaining quota in raw New API units. */
  quotaRemaining: number
  /** Used quota in raw New API units. */
  quotaUsed: number
  requestCount?: number
  /** Raw-units-per-USD for display conversion (New API QuotaPerUnit). */
  unitPerDollar: number
  expiresAt?: number
}

interface AccountResponse {
  username?: string
  group?: string
  quota_remaining?: number
  quota_used?: number
  request_count?: number
  unit_per_dollar?: number
  expires_at?: number
}

const DEFAULT_UNIT_PER_DOLLAR = 500000

let cache: { value: WeoAccount; at: number } | null = null
const CACHE_TTL_MS = 30_000

/** Fetch the current account/quota, with light caching. */
export async function fetchWeoAccount(
  options?: { force?: boolean },
): Promise<WeoAccount | null> {
  if (!options?.force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value
  }
  const token = getWeoToken()
  if (!token) return null

  let res: Response
  try {
    res = await fetch(getWeoAccountUrl(), {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return cache?.value ?? null
  }
  if (!res.ok) return cache?.value ?? null

  let json: AccountResponse
  try {
    json = (await res.json()) as AccountResponse
  } catch {
    return cache?.value ?? null
  }

  const account: WeoAccount = {
    username: json.username,
    group: json.group,
    quotaRemaining: json.quota_remaining ?? 0,
    quotaUsed: json.quota_used ?? 0,
    requestCount: json.request_count,
    unitPerDollar:
      json.unit_per_dollar && json.unit_per_dollar > 0
        ? json.unit_per_dollar
        : DEFAULT_UNIT_PER_DOLLAR,
    expiresAt: json.expires_at,
  }
  cache = { value: account, at: Date.now() }
  return account
}

/** Invalidate the cached account (e.g. after login/logout). */
export function clearWeoAccountCache(): void {
  cache = null
}

/** Format raw quota units as a USD string. */
export function formatQuotaUsd(units: number, unitPerDollar: number): string {
  const usd = units / (unitPerDollar || DEFAULT_UNIT_PER_DOLLAR)
  return `$${usd.toFixed(2)}`
}
