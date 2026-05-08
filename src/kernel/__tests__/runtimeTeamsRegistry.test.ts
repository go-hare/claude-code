import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  cloneBootstrapState,
  runWithBootstrapState,
} from '../../bootstrap/state.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { createDefaultKernelRuntimeTeamRegistry } from '../runtimeTeamsRegistry.js'

const previousConfigDir = process.env.CLAUDE_CONFIG_DIR

let tempConfigDir: string | undefined

describe('default kernel team registry', () => {
  beforeEach(async () => {
    tempConfigDir = await mkdtemp(join(tmpdir(), 'kernel-teams-'))
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  })

  afterEach(async () => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }

    if (tempConfigDir) {
      await rm(tempConfigDir, { recursive: true, force: true })
      tempConfigDir = undefined
    }
  })

  test('preserves the active session id when creating a team through the default registry', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000123'
    const bootstrapState = cloneBootstrapState()
    bootstrapState.sessionId = sessionId as typeof bootstrapState.sessionId
    bootstrapState.sessionCreatedTeams = new Set()

    await runWithBootstrapState(bootstrapState, async () => {
      const registry = createDefaultKernelRuntimeTeamRegistry({
        getSessionId: () => sessionId,
      })

      const created = await registry.createTeam?.({
        teamName: 'kernel-session-fallback',
      })
      expect(created?.team.leadSessionId).toBe(sessionId)

      const teamFile = await readTeamFileAsync(created!.team.teamName)
      expect(teamFile?.leadSessionId).toBe(sessionId)

      const explicit = await registry.createTeam?.({
        teamName: 'kernel-explicit-session',
        leadSessionId: 'explicit-session',
      })
      expect(explicit?.team.leadSessionId).toBe('explicit-session')
    })
  })
})
