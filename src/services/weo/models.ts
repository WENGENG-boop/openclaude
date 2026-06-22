/**
 * Live model discovery for the Weo platform.
 *
 * Fetches the relay's `/v1/models` (New API exposes an OpenAI-style listing)
 * every time it's called, so the `/model` picker always reflects exactly which
 * models the platform currently serves — no static list.
 */
import { getWeoModelsUrl } from '../../constants/weo.js'
import type { ModelOption } from '../../utils/model/modelOptions.js'
import { getWeoToken } from './auth.js'

interface ModelsResponse {
  data?: Array<{ id?: string }>
  models?: Array<{ id?: string }>
}

/** Fetch the current list of model ids served by the Weo relay. */
export async function fetchWeoModelIds(): Promise<string[]> {
  const token = getWeoToken()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) {
    // Send both schemes so listing works regardless of how the relay
    // authenticates the models endpoint.
    headers['Authorization'] = `Bearer ${token}`
    headers['x-api-key'] = token
  }

  const res = await fetch(getWeoModelsUrl(), { headers })
  if (!res.ok) {
    throw new Error(`Weo model listing failed (HTTP ${res.status}).`)
  }
  const json = (await res.json()) as ModelsResponse
  const list = json.data ?? json.models ?? []
  const ids = list
    .map(m => (m?.id ?? '').trim())
    .filter((id): id is string => id.length > 0)
  return [...new Set(ids)]
}

/** Map model ids to picker options. */
export function weoModelIdsToOptions(ids: string[]): ModelOption[] {
  return ids.map(id => ({
    value: id,
    label: id,
    description: 'Provider: Weo',
  }))
}
