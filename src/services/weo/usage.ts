/**
 * Weo usage stats for the /usage panel.
 *
 * Combines two sources:
 *  - Platform quota (total / used / remaining) via the bridge — see account.ts.
 *  - This session's per-model usage from the local cost tracker, which is exact
 *    and needs no network. Used to rank the models you've used this session.
 */
import {
  getModelUsage,
  getTotalCostUSD,
  getTotalDuration,
} from '../../bootstrap/state.js'
import { getCanonicalName } from '../../utils/model/model.js'

export interface WeoSessionModelStat {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUSD: number
}

export interface WeoSessionUsage {
  totalCostUSD: number
  durationMs: number
  totalTokens: number
  /** Per-model stats, ranked by total tokens descending (most used first). */
  models: WeoSessionModelStat[]
}

/** Build this session's per-model usage ranking from the local cost tracker. */
export function getWeoSessionUsage(): WeoSessionUsage {
  const map = getModelUsage()
  const byShortName: Record<string, WeoSessionModelStat> = {}

  for (const [model, usage] of Object.entries(map)) {
    const name = getCanonicalName(model)
    const stat =
      byShortName[name] ??
      (byShortName[name] = {
        model: name,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUSD: 0,
      })
    stat.inputTokens += usage.inputTokens
    stat.outputTokens += usage.outputTokens
    stat.costUSD += usage.costUSD
    stat.totalTokens += usage.inputTokens + usage.outputTokens
  }

  const models = Object.values(byShortName).sort(
    (a, b) => b.totalTokens - a.totalTokens,
  )

  return {
    totalCostUSD: getTotalCostUSD(),
    durationMs: getTotalDuration(),
    totalTokens: models.reduce((n, m) => n + m.totalTokens, 0),
    models,
  }
}

/** Compact token formatter: 12345 → "12.3K", 1200000 → "1.2M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

/** Duration formatter: ms → "1h 2m" / "2m 3s" / "5s". */
export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${s}s`
}
