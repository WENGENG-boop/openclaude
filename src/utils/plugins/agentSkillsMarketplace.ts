/**
 * Constants for Anthropic's agent-skills marketplace and the built-in
 * document-skills plugin (Word / PowerPoint / Excel / PDF).
 *
 * The `anthropic-agent-skills` marketplace lives in the public `anthropics/skills`
 * GitHub repository (the same skills that power Claude's document capabilities).
 * The `document-skills` plugin from that marketplace is enabled by default so the
 * docx/pptx/xlsx/pdf skills ship out of the box. Like the official marketplace,
 * the marketplace is cloned on demand by the reconciler when an enabled plugin
 * references it (see getDeclaredMarketplaces), and users can disable it via
 * `/plugin` or by setting the env var below.
 */

import { isEnvTruthy } from '../envUtils.js'
import type { MarketplaceSource } from './schemas.js'

/**
 * Source configuration for the agent-skills marketplace.
 * Used as the implicit/fallback source when the marketplace is cloned on startup.
 */
export const AGENT_SKILLS_MARKETPLACE_SOURCE = {
  source: 'github',
  repo: 'anthropics/skills',
} as const satisfies MarketplaceSource

/**
 * Display name under which the marketplace is registered in
 * known_marketplaces.json. Must match the `name` field in the upstream
 * `.claude-plugin/marketplace.json`.
 */
export const AGENT_SKILLS_MARKETPLACE_NAME = 'anthropic-agent-skills'

/**
 * Built-in document-creation skills plugin (docx, pptx, xlsx, pdf).
 * Enabled by default unless the user disables it.
 */
export const DOCUMENT_SKILLS_PLUGIN_ID = `document-skills@${AGENT_SKILLS_MARKETPLACE_NAME}`

/**
 * Check whether default auto-enabling of the document-skills plugin is
 * disabled via environment variable. Mirrors the official-marketplace opt-out.
 */
export function isDocumentSkillsAutoEnableDisabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS)
}

/**
 * Built-in plugins that ship enabled by default. Merged at the LOWEST
 * precedence under --add-dir and user/project/local/policy settings, so any
 * explicit `false` (including enterprise policy) still wins.
 */
export function getBuiltinDefaultEnabledPlugins(): Record<string, boolean> {
  if (isDocumentSkillsAutoEnableDisabled()) return {}
  return { [DOCUMENT_SKILLS_PLUGIN_ID]: true }
}
