import { afterEach, describe, expect, test } from 'bun:test'
import {
  AGENT_SKILLS_MARKETPLACE_NAME,
  AGENT_SKILLS_MARKETPLACE_SOURCE,
  DOCUMENT_SKILLS_PLUGIN_ID,
  getBuiltinDefaultEnabledPlugins,
  isDocumentSkillsAutoEnableDisabled,
} from './agentSkillsMarketplace.js'
import { ALLOWED_OFFICIAL_MARKETPLACE_NAMES } from './schemas.js'

describe('agentSkillsMarketplace', () => {
  const original = process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS
    } else {
      process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS = original
    }
  })

  test('plugin id is document-skills on the agent-skills marketplace', () => {
    expect(AGENT_SKILLS_MARKETPLACE_NAME).toBe('anthropic-agent-skills')
    expect(DOCUMENT_SKILLS_PLUGIN_ID).toBe(
      'document-skills@anthropic-agent-skills',
    )
  })

  test('marketplace source points at the public anthropics/skills repo', () => {
    expect(AGENT_SKILLS_MARKETPLACE_SOURCE).toEqual({
      source: 'github',
      repo: 'anthropics/skills',
    })
  })

  test('marketplace name is reserved for the official Anthropic org', () => {
    // Reserved-name validation requires the name to be in the allow-list so
    // the implicit github:anthropics/skills source passes registration.
    expect(
      ALLOWED_OFFICIAL_MARKETPLACE_NAMES.has(AGENT_SKILLS_MARKETPLACE_NAME),
    ).toBe(true)
  })

  test('document-skills is default-enabled', () => {
    delete process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS
    expect(getBuiltinDefaultEnabledPlugins()).toEqual({
      [DOCUMENT_SKILLS_PLUGIN_ID]: true,
    })
  })

  test('env var opts out of default-enabling', () => {
    process.env.CLAUDE_CODE_DISABLE_DOCUMENT_SKILLS = '1'
    expect(isDocumentSkillsAutoEnableDisabled()).toBe(true)
    expect(getBuiltinDefaultEnabledPlugins()).toEqual({})
  })
})
