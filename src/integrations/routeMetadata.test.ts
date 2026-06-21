import { expect, test } from 'bun:test'

import {
  getRouteCredentialEnvVars,
  getRouteCredentialValue,
  getRouteDefaultBaseUrl,
  getRouteDefaultModel,
  getRouteProviderTypeLabel,
  resolveActiveRouteIdFromEnv,
  resolveRouteIdFromBaseUrl,
} from './routeMetadata.js'

test('getRouteProviderTypeLabel uses descriptor transport kinds for provider labels', () => {
  expect(getRouteProviderTypeLabel('anthropic')).toBe('Anthropic native API')
  expect(getRouteProviderTypeLabel('gemini')).toBe('Gemini API')
  expect(getRouteProviderTypeLabel('bedrock')).toBe(
    'AWS Bedrock Claude API',
  )
  expect(getRouteProviderTypeLabel('vertex')).toBe(
    'Google Vertex Claude API',
  )
  expect(getRouteProviderTypeLabel('openrouter')).toBe(
    'OpenAI-compatible API',
  )
  expect(getRouteProviderTypeLabel('ollama')).toBe('OpenAI-compatible API')
})

test('getRouteProviderTypeLabel falls back safely for unknown routes', () => {
  expect(getRouteProviderTypeLabel('missing-route')).toBe(
    'OpenAI-compatible API',
  )
})

test('getRouteCredentialEnvVars keeps descriptor env vars and openai fallback for openai-compatible routes', () => {
  expect(getRouteCredentialEnvVars('openrouter')).toEqual([
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
  ])
  expect(getRouteCredentialEnvVars('deepseek')).toEqual([
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
  ])
  expect(getRouteCredentialEnvVars('hicap')).toEqual([
    'HICAP_API_KEY',
    'OPENAI_API_KEY',
  ])
  expect(getRouteCredentialEnvVars('venice')).toEqual([
    'VENICE_API_KEY',
    'OPENAI_API_KEY',
  ])
  expect(getRouteCredentialEnvVars('xiaomi-mimo')).toEqual([
    'MIMO_API_KEY',
    'OPENAI_API_KEY',
  ])
})

test('getRouteCredentialEnvVars omits the openai fallback for dedicatedCredentialsOnly routes', () => {
  expect(getRouteCredentialEnvVars('atlas-cloud')).toEqual([
    'ATLAS_CLOUD_API_KEY',
  ])
  expect(
    getRouteCredentialValue('atlas-cloud', {
      OPENAI_API_KEY: 'sk-openai-generic',
    }),
  ).toBeUndefined()
  expect(
    getRouteCredentialValue('atlas-cloud', {
      OPENAI_API_KEY: 'sk-openai-generic',
      ATLAS_CLOUD_API_KEY: 'atlas-key',
    }),
  ).toBe('atlas-key')
})

test('getRouteCredentialValue reads the first configured route credential', () => {
  expect(
    getRouteCredentialValue('openrouter', {
      OPENROUTER_API_KEY: 'or-key',
    }),
  ).toBe('or-key')
  expect(
    getRouteCredentialValue('deepseek', {
      OPENAI_API_KEY: 'sk-openai-fallback',
    }),
  ).toBe('sk-openai-fallback')
})

test('Venice route metadata uses official OpenAI-compatible defaults', () => {
  expect(getRouteDefaultBaseUrl('venice')).toBe('https://api.venice.ai/api/v1')
  expect(getRouteDefaultModel('venice')).toBe('venice-uncensored')
  expect(resolveRouteIdFromBaseUrl('https://api.venice.ai/api/v1')).toBe('venice')
  expect(resolveRouteIdFromBaseUrl('https://api.venice.ai/api/v1/chat/completions')).toBe('venice')
})

test('Xiaomi MiMo route metadata uses official OpenAI-compatible defaults', () => {
  expect(getRouteDefaultBaseUrl('xiaomi-mimo')).toBe('https://api.xiaomimimo.com/v1')
  expect(getRouteDefaultModel('xiaomi-mimo')).toBe('mimo-v2.5-pro')
  expect(resolveRouteIdFromBaseUrl('https://api.xiaomimimo.com/v1')).toBe('xiaomi-mimo')
  expect(resolveRouteIdFromBaseUrl('https://api.xiaomimimo.com/v1/chat/completions')).toBe('xiaomi-mimo')
  expect(resolveRouteIdFromBaseUrl('https://api.mimo-v2.com/v1')).toBe('xiaomi-mimo')
})

// Weo single-provider lock: resolveActiveRouteIdFromEnv always resolves to the
// Anthropic-compatible Weo relay, ignoring any inherited provider env vars.
test('resolveActiveRouteIdFromEnv is locked to anthropic regardless of env', () => {
  expect(resolveActiveRouteIdFromEnv({})).toBe('anthropic')
  expect(
    resolveActiveRouteIdFromEnv({
      CLAUDE_CODE_USE_OPENAI: '1',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    }),
  ).toBe('anthropic')
  expect(
    resolveActiveRouteIdFromEnv({
      CLAUDE_CODE_USE_GEMINI: '1',
      MINIMAX_API_KEY: 'minimax-key',
      XAI_API_KEY: 'xai-key',
    }),
  ).toBe('anthropic')
})
