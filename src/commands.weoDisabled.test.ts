import { expect, test } from 'bun:test'

import {
  WEO_DISABLED_COMMAND_NAMES,
  builtInCommandNames,
} from './commands.js'

test('Weo-disabled commands are not registered as built-in commands', () => {
  const names = builtInCommandNames()
  for (const disabled of WEO_DISABLED_COMMAND_NAMES) {
    expect(names.has(disabled)).toBe(false)
  }
})

test('the Weo /provider command stays available', () => {
  expect(builtInCommandNames().has('provider')).toBe(true)
})
