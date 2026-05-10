import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const content = readFileSync(
  join(import.meta.dir, '../inProcessRunner.ts'),
  'utf8',
)

describe('inProcessRunner lifecycle sync', () => {
  test('marks in-process teammates active when a turn starts', () => {
    expect(content).toContain(
      'await setMemberActive(identity.teamName, identity.agentName, true)',
    )
  })

  test('marks in-process teammates idle when a turn completes', () => {
    expect(content).toContain(
      'await setMemberActive(identity.teamName, identity.agentName, false)',
    )
  })

  test('removes in-process teammates from the team file on terminal exit', () => {
    expect(content).toContain(
      'removeMemberByAgentId(identity.teamName, identity.agentId)',
    )
  })
})
