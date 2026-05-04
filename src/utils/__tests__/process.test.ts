import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'

import {
  peekForStdinData,
  readTextFromStdinWithTimeout,
} from '../process.js'

describe('peekForStdinData', () => {
  test('does not hang when stdin ended before the peek listeners attach', async () => {
    const stream = new EventEmitter() as EventEmitter & {
      readableEnded: boolean
    }
    stream.readableEnded = true

    await expect(peekForStdinData(stream, 10_000)).resolves.toBe(false)
  })
})

describe('readTextFromStdinWithTimeout', () => {
  test('reads data and end through one race-free listener set', async () => {
    const stream = new PassThrough()
    const result = readTextFromStdinWithTimeout(stream, 10_000)

    stream.write('hello')
    stream.end(' world')

    await expect(result).resolves.toEqual({
      text: 'hello world',
      timedOut: false,
    })
  })
})
