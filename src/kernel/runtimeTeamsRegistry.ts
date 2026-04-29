import { readdir } from 'fs/promises'

import { getSessionId } from '../bootstrap/state.js'
import type {
  RuntimeTeamCreateRequest,
  RuntimeTeamCreateResult,
  RuntimeTeamDescriptor,
  RuntimeTeamDestroyRequest,
  RuntimeTeamDestroyResult,
  RuntimeTeamListSnapshot,
  RuntimeTeamMemberDescriptor,
  RuntimeTeamMessageRequest,
  RuntimeTeamMessageResult,
} from '../runtime/contracts/team.js'
import type { KernelRuntimeWireTeamRegistry } from '../runtime/core/wire/KernelRuntimeWireRouter.js'
import { formatAgentId } from '../utils/agentId.js'
import { getTeamsDir } from '../utils/envUtils.js'
import { writeToMailbox } from '../utils/teammateMailbox.js'
import { TEAM_LEAD_NAME } from '../utils/swarm/constants.js'
import {
  cleanupTeamDirectories,
  getTeamFilePath,
  readTeamFileAsync,
  registerTeamForSessionCleanup,
  sanitizeName,
  type TeamFile,
  unregisterTeamForSessionCleanup,
  writeTeamFileAsync,
} from '../utils/swarm/teamHelpers.js'
import {
  clearLeaderTeamName,
  ensureTasksDir,
  resetTaskList,
  setLeaderTeamName,
} from '../utils/tasks.js'
import { generateWordSlug } from '../utils/words.js'

export function createDefaultKernelRuntimeTeamRegistry(): KernelRuntimeWireTeamRegistry {
  return {
    async listTeams() {
      const teamsDir = getTeamsDir()
      let entries: Array<{ isDirectory(): boolean; name: string }>
      try {
        entries = (await readdir(teamsDir, {
          withFileTypes: true,
        })) as Array<{ isDirectory(): boolean; name: string }>
      } catch {
        return { teams: [] }
      }

      const teams = await Promise.all(
        entries
          .filter(entry => entry.isDirectory())
          .map(async entry => {
            const teamFile = await readTeamFileAsync(entry.name)
            if (!teamFile) {
              return undefined
            }
            return toRuntimeTeamDescriptor(teamFile.name, teamFile)
          }),
      )

      return {
        teams: teams
          .filter((team): team is RuntimeTeamDescriptor => team !== undefined)
          .sort((left, right) => left.teamName.localeCompare(right.teamName)),
      }
    },
    async getTeam(teamName) {
      const teamFile = await readTeamFileAsync(teamName)
      if (!teamFile) {
        return null
      }
      return toRuntimeTeamDescriptor(teamName, teamFile)
    },
    async createTeam(request, context) {
      return createRuntimeTeam(request, context?.cwd)
    },
    async sendMessage(request) {
      return sendRuntimeTeamMessage(request)
    },
    async destroyTeam(request) {
      return destroyRuntimeTeam(request)
    },
  }
}

async function createRuntimeTeam(
  request: RuntimeTeamCreateRequest,
  cwd: string | undefined,
): Promise<RuntimeTeamCreateResult> {
  const requestedTeamName = request.teamName.trim()
  if (requestedTeamName.length === 0) {
    throw new Error('teamName is required')
  }

  const existing = await readTeamFileAsync(requestedTeamName)
  if (existing && !request.allowRename) {
    return {
      created: false,
      team: toRuntimeTeamDescriptor(existing.name, existing),
      requestedTeamName,
      message: `Team "${requestedTeamName}" already exists`,
    }
  }

  const finalTeamName = existing
    ? await generateUniqueTeamName(requestedTeamName)
    : requestedTeamName
  const createdAt = Date.now()
  const leadAgentId = formatAgentId(TEAM_LEAD_NAME, finalTeamName)
  const teamFile: TeamFile = {
    name: finalTeamName,
    description: request.description,
    createdAt,
    leadAgentId,
    leadSessionId: request.leadSessionId ?? getSessionId(),
    members: [
      {
        agentId: leadAgentId,
        name: TEAM_LEAD_NAME,
        agentType: request.leadAgentType ?? TEAM_LEAD_NAME,
        model: request.leadModel,
        joinedAt: createdAt,
        tmuxPaneId: '',
        cwd: request.workspacePath ?? cwd ?? process.cwd(),
        subscriptions: [],
        isActive: true,
      },
    ],
  }

  await writeTeamFileAsync(finalTeamName, teamFile)
  registerTeamForSessionCleanup(finalTeamName)

  const taskListId = sanitizeName(finalTeamName)
  await resetTaskList(taskListId)
  await ensureTasksDir(taskListId)
  setLeaderTeamName(taskListId)

  return {
    created: true,
    team: toRuntimeTeamDescriptor(finalTeamName, teamFile),
    requestedTeamName,
    message:
      finalTeamName === requestedTeamName
        ? undefined
        : `Team "${requestedTeamName}" already existed; created "${finalTeamName}" instead.`,
  }
}

async function sendRuntimeTeamMessage(
  request: RuntimeTeamMessageRequest,
): Promise<RuntimeTeamMessageResult> {
  const teamFile = await readTeamFileAsync(request.teamName)
  if (!teamFile) {
    return {
      success: false,
      teamName: request.teamName,
      recipients: [],
      message: `Team "${request.teamName}" does not exist`,
    }
  }

  const sender = request.sender?.trim() || TEAM_LEAD_NAME
  const recipients =
    request.recipient === '*'
      ? teamFile.members
          .filter(member => member.name.toLowerCase() !== sender.toLowerCase())
          .map(member => member.name)
      : [request.recipient]

  if (recipients.length === 0) {
    return {
      success: true,
      teamName: request.teamName,
      recipients: [],
      message: 'No recipients matched the requested team broadcast',
    }
  }

  for (const recipient of recipients) {
    await writeToMailbox(
      recipient,
      {
        from: sender,
        text: request.message,
        summary: request.summary,
        timestamp: new Date().toISOString(),
      },
      request.teamName,
    )
  }

  return {
    success: true,
    teamName: request.teamName,
    recipients,
    message:
      request.recipient === '*'
        ? `Message broadcast to ${recipients.length} teammate(s)`
        : `Message sent to ${request.recipient}`,
  }
}

async function destroyRuntimeTeam(
  request: RuntimeTeamDestroyRequest,
): Promise<RuntimeTeamDestroyResult> {
  const teamFile = await readTeamFileAsync(request.teamName)
  if (!teamFile) {
    return {
      success: false,
      teamName: request.teamName,
      message: `Team "${request.teamName}" does not exist`,
    }
  }

  const blockedMembers = teamFile.members
    .filter(member => member.name !== TEAM_LEAD_NAME && member.isActive !== false)
    .map(member => member.name)

  if (blockedMembers.length > 0 && request.force !== true) {
    return {
      success: false,
      teamName: request.teamName,
      blockedMembers,
      message: `Cleanup is blocked by active teammate(s): ${blockedMembers.join(', ')}`,
    }
  }

  await cleanupTeamDirectories(request.teamName)
  unregisterTeamForSessionCleanup(request.teamName)
  clearLeaderTeamName()

  return {
    success: true,
    teamName: request.teamName,
    message: `Cleaned up directories and worktrees for team "${request.teamName}"`,
  }
}

async function generateUniqueTeamName(baseName: string): Promise<string> {
  let candidate = baseName
  while (await readTeamFileAsync(candidate)) {
    candidate = generateWordSlug()
  }
  return candidate
}

function toRuntimeTeamDescriptor(
  teamName: string,
  teamFile: TeamFile,
): RuntimeTeamDescriptor {
  const members = teamFile.members.map(toRuntimeTeamMemberDescriptor)
  return {
    teamName: teamFile.name || teamName,
    description: teamFile.description,
    taskListId: sanitizeName(teamFile.name || teamName),
    teamFilePath: getTeamFilePath(teamName),
    createdAt: teamFile.createdAt,
    leadAgentId: teamFile.leadAgentId,
    leadSessionId: teamFile.leadSessionId,
    memberCount: members.length,
    activeMemberCount: members.filter(member => member.isActive !== false)
      .length,
    members,
  }
}

function toRuntimeTeamMemberDescriptor(
  member: TeamFile['members'][number],
): RuntimeTeamMemberDescriptor {
  return {
    agentId: member.agentId,
    name: member.name,
    agentType: member.agentType,
    model: member.model,
    color: member.color,
    joinedAt: member.joinedAt,
    cwd: member.cwd,
    tmuxPaneId: member.tmuxPaneId || undefined,
    worktreePath: member.worktreePath,
    sessionId: member.sessionId,
    backendType: member.backendType,
    isActive: member.isActive,
    mode: member.mode,
  }
}
