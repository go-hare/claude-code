import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { readTextFromStdinWithTimeout } from '../process'

describe('readTextFromStdinWithTimeout', () => {
  test('returns already-ended streams without waiting', async () => {
    const stream = new EventEmitter() as EventEmitter & {
      readableEnded?: boolean
    }
    stream.readableEnded = true

    const result = await readTextFromStdinWithTimeout(stream, 1000)

    expect(result).toEqual({ text: '', timedOut: false })
  })

  test('collects chunks until end after first data arrives', async () => {
    const stream = new EventEmitter()
    const resultPromise = readTextFromStdinWithTimeout(stream, 1000)

    stream.emit('data', 'hello')
    stream.emit('data', Buffer.from(' world'))
    stream.emit('end')

    await expect(resultPromise).resolves.toEqual({
      text: 'hello world',
      timedOut: false,
    })
  })
})
