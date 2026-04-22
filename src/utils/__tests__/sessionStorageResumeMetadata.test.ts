import { beforeEach, describe, expect, test } from 'bun:test'
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
    cacheSessionTitle('CLI title')
    restoreSessionMetadata({
      tag: 'stale-tag',
      agentColor: 'blue',
      worktreeSession: null,
    })

    resetSessionMetadataForResume()

    expect(getCurrentSessionTitle(getSessionId())).toBe('CLI title')
    expect(getCurrentSessionTag(getSessionId())).toBeUndefined()
    expect(getCurrentSessionAgentColor()).toBeUndefined()
  })

  test('does not preserve a prior custom title that did not come from --name', async () => {
    await saveCustomTitle(getSessionId(), 'Renamed session')
    restoreSessionMetadata({
      tag: 'stale-tag',
      agentColor: 'blue',
    })

    resetSessionMetadataForResume()
    restoreSessionMetadata({
      customTitle: 'Resumed title',
    })

    expect(getCurrentSessionTitle(getSessionId())).toBe('Resumed title')
    expect(getCurrentSessionTag(getSessionId())).toBeUndefined()
    expect(getCurrentSessionAgentColor()).toBeUndefined()
  })
})
