import { describe, expect, test } from 'bun:test'
import { hookSourceDescriptionDisplayString } from './hooksSettings.js'

describe('hookSourceDescriptionDisplayString', () => {
  test('uses the canonical Weo plugin path for plugin hooks', () => {
    // Normalize Windows path separators so the assertion is cross-platform.
    const description = hookSourceDescriptionDisplayString('pluginHook').replace(
      /\\/g,
      '/',
    )

    expect(description).toBe(
      'Plugin hooks (~/.weo/plugins/*/hooks/hooks.json)',
    )
    expect(description).not.toContain('~/.claude/')
    expect(description).not.toContain('~/.openclaude/')
  })
})
