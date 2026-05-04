import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import * as attachments from '../attachments.js'

mock.module('bun:bundle', () => ({
  feature: () => false,
}))

const suppressNextSkillListingSpy = spyOn(
  attachments,
  'suppressNextSkillListing',
)

const { restoreSkillStateFromMessages } = await import(
  '../conversationRecovery.js'
)

describe('restoreSkillStateFromMessages', () => {
  beforeEach(() => {
    suppressNextSkillListingSpy.mockClear()
  })

  afterEach(() => {
    suppressNextSkillListingSpy.mockClear()
  })

  afterAll(() => {
    suppressNextSkillListingSpy.mockRestore()
  })

  test('does not suppress skill listing when resume transcript has no prior listing', () => {
    restoreSkillStateFromMessages([])
    expect(suppressNextSkillListingSpy).not.toHaveBeenCalled()
  })

  test('suppresses skill listing when resume transcript already contains one', () => {
    restoreSkillStateFromMessages([
      {
        type: 'attachment',
        attachment: {
          type: 'skill_listing',
          content: 'skills',
          skillCount: 1,
          isInitial: true,
        },
      } as unknown as Parameters<typeof restoreSkillStateFromMessages>[0][number],
    ])

    expect(suppressNextSkillListingSpy).toHaveBeenCalledTimes(1)
  })
})
