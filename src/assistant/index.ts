import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getKairosActive,
  getSessionCreatedTeams,
  getSessionId,
} from '../bootstrap/state.js'
import type { AppState } from '../state/AppStateStore.js'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'
import {
  TEAM_LEAD_NAME,
  assignTeammateColor,
  ensureTasksDir,
  formatAgentId,
  getDefaultMainLoopModel,
  getInitialSettings,
  getTeamFilePath,
  parseUserSpecifiedModel,
  resetTaskList,
  sanitizeName,
  setCliTeammateModeOverride,
  setLeaderTeamName,
  writeTeamFileAsync,
} from './deps.js'
import type { TeamFile } from '../utils/swarm/teamHelpers.js'

let assistantForced = false
let assistantTeamContextCache:
  | {
      sessionId: string
      context: NonNullable<AppState['teamContext']>
    }
  | undefined

/**
 * Whether the current session is in assistant (KAIROS) daemon mode.
 * Wraps the bootstrap kairosActive state set by main.tsx after gate check.
 */
export function isAssistantMode(): boolean {
  return getKairosActive()
}

/**
 * Mark this session as forced assistant mode (--assistant flag).
 * Skips the GrowthBook gate check — daemon is pre-entitled.
 */
export function markAssistantForced(): void {
  assistantForced = true
}

export function isAssistantForced(): boolean {
  return assistantForced
}

function getAssistantNameSetting(): string | undefined {
  const settings = getInitialSettings() as { assistantName?: unknown }
  const assistantName =
    typeof settings.assistantName === 'string'
      ? settings.assistantName.trim()
      : undefined
  return assistantName || undefined
}

function getAssistantTeamName(sessionId: string): string {
  return `assistant-${sanitizeName(sessionId)}`
}

function buildAssistantSystemPromptBase(): string {
  const assistantName = getAssistantNameSetting()
  const nameLine = assistantName
    ? `\nDisplay name for connected clients: ${assistantName}.`
    : ''

  return `# Assistant Mode

You are running as a persistent assistant session.
Keep the main loop responsive for new inbound user messages and background events.
Use SendUserMessage for concise user-visible updates instead of long passive status monologues.
Prefer background agents or run_in_background for long-running work; do not hold the foreground loop open when work can continue asynchronously.
Use scheduled tasks for follow-ups, check-ins, and deferred work rather than busy waiting.
If the user is actively engaging with you, prioritize their latest message over background chores.
If there is nothing useful to do right now, stay idle instead of narrating inactivity.${nameLine}`
}

/**
 * Pre-create an in-process team so Agent(name) can spawn teammates
 * without TeamCreate.
 */
export async function initializeAssistantTeam(
  requestedModel?: string,
): Promise<AppState['teamContext'] | undefined> {
  const sessionId = getSessionId()

  if (assistantTeamContextCache?.sessionId === sessionId) {
    setCliTeammateModeOverride('in-process')
    return assistantTeamContextCache.context
  }

  const teamName = getAssistantTeamName(sessionId)
  const leadAgentId = formatAgentId(TEAM_LEAD_NAME, teamName)
  const teamFilePath = getTeamFilePath(teamName)
  const cwd = getCwd()
  const leadColor = assignTeammateColor(leadAgentId)
  const leadModel = requestedModel
    ? parseUserSpecifiedModel(requestedModel)
    : getDefaultMainLoopModel()

  const teamFile: TeamFile = {
    name: teamName,
    description: 'Assistant mode implicit in-process team',
    createdAt: Date.now(),
    leadAgentId,
    leadSessionId: sessionId,
    members: [
      {
        agentId: leadAgentId,
        name: TEAM_LEAD_NAME,
        agentType: TEAM_LEAD_NAME,
        model: leadModel,
        joinedAt: Date.now(),
        tmuxPaneId: 'leader',
        cwd,
        subscriptions: [],
        backendType: 'in-process',
      },
    ],
  }

  await writeTeamFileAsync(teamName, teamFile)
  getSessionCreatedTeams().add(teamName)

  const taskListId = sanitizeName(teamName)
  await ensureTasksDir(taskListId)
  await resetTaskList(taskListId)
  setLeaderTeamName(taskListId)
  setCliTeammateModeOverride('in-process')

  const context: NonNullable<AppState['teamContext']> = {
    teamName,
    teamFilePath,
    leadAgentId,
    selfAgentId: leadAgentId,
    selfAgentName: TEAM_LEAD_NAME,
    isLeader: true,
    selfAgentColor: leadColor,
    teammates: {
      [leadAgentId]: {
        name: TEAM_LEAD_NAME,
        agentType: TEAM_LEAD_NAME,
        color: leadColor,
        tmuxSessionName: 'in-process',
        tmuxPaneId: 'leader',
        cwd,
        spawnedAt: Date.now(),
      },
    },
  }

  assistantTeamContextCache = { sessionId, context }
  logForDebugging(
    `[assistant] initialized implicit in-process team ${teamName} for session ${sessionId}`,
  )

  return context
}

/**
 * Assistant-specific system prompt addendum.
 *
 * Includes a built-in KAIROS baseline plus the optional
 * `~/.claude/agents/assistant.md` user override/addendum.
 */
export function getAssistantSystemPromptAddendum(): string {
  const sections = [buildAssistantSystemPromptBase()]

  try {
    const customPrompt = readFileSync(
      join(getClaudeConfigHomeDir(), 'agents', 'assistant.md'),
      'utf-8',
    )
    if (customPrompt.trim()) {
      sections.push(customPrompt.trim())
    }
  } catch {
    // Optional file; built-in prompt is still returned.
  }

  return sections.join('\n\n')
}

/**
 * How assistant mode was activated. Used for diagnostics/analytics.
 * - 'daemon': via --assistant flag (Agent SDK daemon)
 * - 'gate': via GrowthBook gate check
 */
export function getAssistantActivationPath(): string | undefined {
  if (!isAssistantMode()) return undefined
  return assistantForced ? 'daemon' : 'gate'
}
