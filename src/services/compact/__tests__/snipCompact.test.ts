import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import type { Message } from 'src/types/message'
import {
  SNIP_NUDGE_TEXT,
  isSnipRuntimeEnabled,
  shouldNudgeForSnips,
  snipCompactIfNeeded,
} from '../snipCompact.js'

function makeUserMessage(content: string): Message {
  return {
    type: 'user',
    message: { role: 'user', content },
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  } as Message
}

function makeSnipBoundary(removedUuids: string[]): Message {
  return {
    type: 'system',
    subtype: 'snip_boundary',
    content: '[snip] Conversation history before this point has been snipped.',
    isMeta: true,
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
    snipMetadata: { removedUuids },
  } as Message
}

describe('snipCompact', () => {
  test('compacts when forced', () => {
    const first = makeUserMessage('first')
    const second = makeUserMessage('second')
    const boundary = makeSnipBoundary([first.uuid])

    const result = snipCompactIfNeeded([first, second, boundary], {
      force: true,
    })

    expect(result.executed).toBe(true)
    expect(result.messages).toEqual([second, boundary])
    expect(result.tokensFreed).toBe(1)
    expect(result.boundaryMessage).toEqual(boundary)
  })

  test('unions removed uuids from earlier boundaries during compaction', () => {
    const first = makeUserMessage('first')
    const second = makeUserMessage('second')
    const third = makeUserMessage('third')
    const firstBoundary = makeSnipBoundary([first.uuid])
    const secondBoundary = makeSnipBoundary([second.uuid])

    const result = snipCompactIfNeeded([
      first,
      second,
      firstBoundary,
      third,
      secondBoundary,
    ])

    expect(result.executed).toBe(true)
    expect(result.messages).toEqual([firstBoundary, third, secondBoundary])
    expect(result.tokensFreed).toBe(2)
    expect(result.boundaryMessage).toEqual(secondBoundary)
  })

  test('does not compact without force or boundary', () => {
    const first = makeUserMessage('first')
    const result = snipCompactIfNeeded([first])

    expect(result.executed).toBe(false)
    expect(result.messages).toEqual([first])
    expect(result.boundaryMessage).toBeUndefined()
  })

  test('runtime helpers return usable defaults', () => {
    expect(isSnipRuntimeEnabled()).toBe(true)
    expect(shouldNudgeForSnips(Array.from({ length: 20 }, (_, i) => makeUserMessage(String(i))))).toBe(true)
    expect(SNIP_NUDGE_TEXT.length).toBeGreaterThan(0)
  })
})
