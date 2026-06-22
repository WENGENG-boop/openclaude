import { expect, test } from 'bun:test'

import { maskToken } from './provider.js'

test('maskToken keeps the last 4 characters', () => {
  expect(maskToken('sk-abcd1234')).toBe('••••1234')
})

test('maskToken fully redacts short tokens', () => {
  expect(maskToken('1234')).toBe('••••')
  expect(maskToken('ab')).toBe('••••')
})

test('maskToken trims surrounding whitespace before masking', () => {
  expect(maskToken('  sk-wxyz9876  ')).toBe('••••9876')
})
