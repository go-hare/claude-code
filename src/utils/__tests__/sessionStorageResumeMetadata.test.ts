import { beforeEach, describe, expect, test } from 'bun:test'
import type { UUID } from 'crypto'
import { getSessionId } from '../../bootstrap/state'
import {
  cacheSessionTitle,
  clearSessionMetadata,
  getCurrentSessionAgentColor,
  getCurrentSessionTag,
  getCurrentSessionTitle,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
  saveCustomTitle,
} from '../sessionStorage'

describe('resetSessionMetadataForResume', () => {
  beforeEach(() => {
    clearSessionMetadata()
  })

  test('preserves explicit cached title while clearing resume-only metadata', () => {
    const currentSessionId = getSessionId()
    const currentSessionUuid = currentSessionId as unknown as UUID
    cacheSessionTitle('CLI title')
    restoreSessionMetadata({
      tag: 'stale-tag',
      agentColor: 'blue',
      worktreeSession: null,
    })

    resetSessionMetadataForResume()

    expect(getCurrentSessionTitle(currentSessionId)).toBe('CLI title')
    expect(getCurrentSessionTag(currentSessionUuid)).toBeUndefined()
    expect(getCurrentSessionAgentColor()).toBeUndefined()
  })

  test('does not preserve a prior custom title that did not come from --name', async () => {
    const currentSessionId = getSessionId()
    const currentSessionUuid = currentSessionId as unknown as UUID
    await saveCustomTitle(currentSessionUuid, 'Renamed session')
    restoreSessionMetadata({
      tag: 'stale-tag',
      agentColor: 'blue',
    })

    resetSessionMetadataForResume()
    restoreSessionMetadata({
      customTitle: 'Resumed title',
    })

    expect(getCurrentSessionTitle(currentSessionId)).toBe('Resumed title')
    expect(getCurrentSessionTag(currentSessionUuid)).toBeUndefined()
    expect(getCurrentSessionAgentColor()).toBeUndefined()
  })
})
