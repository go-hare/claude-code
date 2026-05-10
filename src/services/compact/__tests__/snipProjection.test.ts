import { describe, expect, test } from 'bun:test'
import { randomUUID } from 'crypto'
import type { Message } from 'src/types/message'
import {
  isSnipBoundaryMessage,
  projectSnippedView,
} from '../snipProjection.js'

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

describe('snipProjection', () => {
  test('recognizes snip boundary messages', () => {
    const boundary = makeSnipBoundary([])
    expect(isSnipBoundaryMessage(boundary)).toBe(true)
  })

  test('projects out removed messages before the latest boundary', () => {
    const first = makeUserMessage('first')
    const second = makeUserMessage('second')
    const boundary = makeSnipBoundary([first.uuid])
    const after = makeUserMessage('after')

    const projected = projectSnippedView([first, second, boundary, after])

    expect(projected).toEqual([second, boundary, after])
  })

  test('unions removed uuids across multiple boundaries while keeping the latest boundary onward', () => {
    const first = makeUserMessage('first')
    const second = makeUserMessage('second')
    const third = makeUserMessage('third')
    const firstBoundary = makeSnipBoundary([first.uuid])
    const secondBoundary = makeSnipBoundary([second.uuid])
    const after = makeUserMessage('after')

    const projected = projectSnippedView([
      first,
      second,
      firstBoundary,
      third,
      secondBoundary,
      after,
    ])

    expect(projected).toEqual([firstBoundary, third, secondBoundary, after])
  })

  test('returns original messages when there is no boundary', () => {
    const first = makeUserMessage('first')
    const second = makeUserMessage('second')

    expect(projectSnippedView([first, second])).toEqual([first, second])
  })
})
