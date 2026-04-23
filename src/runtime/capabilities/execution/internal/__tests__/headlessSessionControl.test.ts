import { describe, expect, mock, test } from 'bun:test'
import { createHeadlessSessionContext } from '../headlessSessionControl.js'

describe('createHeadlessSessionContext', () => {
  test('tracks received UUIDs per session', () => {
    const sessionA = createHeadlessSessionContext()
    const sessionB = createHeadlessSessionContext()
    const uuid =
      '11111111-1111-1111-1111-111111111111' as `${string}-${string}-${string}-${string}-${string}`

    expect(sessionA.control.trackReceivedMessageUuid(uuid)).toBe(true)
    expect(sessionA.control.hasReceivedMessageUuid(uuid)).toBe(true)

    expect(sessionB.control.hasReceivedMessageUuid(uuid)).toBe(false)
    expect(sessionB.control.trackReceivedMessageUuid(uuid)).toBe(true)
  })

  test('runs registered cleanups once in reverse order', async () => {
    const session = createHeadlessSessionContext()
    const calls: string[] = []
    const first = mock(() => {
      calls.push('first')
    })
    const second = mock(() => {
      calls.push('second')
    })

    session.registerCleanup(first)
    session.registerCleanup(second)

    await session.cleanup()
    await session.cleanup()

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['second', 'first'])
  })
})
