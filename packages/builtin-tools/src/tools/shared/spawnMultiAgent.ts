/**
 * Shared spawn module for teammate creation.
 * Extracted from TeammateTool to allow reuse by AgentTool.
 */

import React from 'react'
import {
  isCustomAgent,
  type CustomAgentDefinition,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { ToolUseContext } from 'src/Tool.js'
import { isInProcessTeammateTask } from 'src/tasks/InProcessTeammateTask/types.js'
import { formatAgentId } from 'src/utils/agentId.js'
import { getGlobalConfig } from 'src/utils/config.js'
import { getCwd } from 'src/utils/cwd.js'
import { logForDebugging } from 'src/utils/debug.js'
import { errorMessage } from 'src/utils/errors.js'
import { parseUserSpecifiedModel } from 'src/utils/model/model.js'
import type { PermissionMode } from 'src/utils/permissions/PermissionMode.js'
import { isTmuxAvailable } from 'src/utils/swarm/backends/detection.js'
import {
  createInProcessTeammateExecutor,
  createPaneTeammateExecutor,
  createTeammateExecutorForMember,
  registerOutOfProcessTeammateTaskForTesting,
  resetTrackedPaneCleanupForTesting,
  type TeammateSpawnExecutionResult,
  type TeammateSpawnRequest,
} from 'src/utils/swarm/backends/executorFacade.js'
import {
  detectAndGetBackend,
  isInProcessEnabled,
  markInProcessFallback,
  resetBackendDetection,
} from 'src/utils/swarm/backends/registry.js'
import { getTeammateModeFromSnapshot } from 'src/utils/swarm/backends/teammateModeSnapshot.js'
import type { BackendDetectionResult } from 'src/utils/swarm/backends/types.js'
import { TEAM_LEAD_NAME } from 'src/utils/swarm/constants.js'
import { It2SetupPrompt } from 'src/utils/swarm/It2SetupPrompt.js'
import {
  getTeamFilePath,
  readTeamFileAsync,
  sanitizeAgentName,
  type TeamFile,
  writeTeamFileAsync,
} from 'src/utils/swarm/teamHelpers.js'
import { assignTeammateColor } from 'src/utils/swarm/teammateLayoutManager.js'
import { getHardcodedTeammateModelFallback } from 'src/utils/swarm/teammateModel.js'
import { writeToMailbox } from 'src/utils/teammateMailbox.js'

function getDefaultTeammateModel(leaderModel: string | null): string {
  const configured = getGlobalConfig().teammateDefaultModel
  if (configured === null) {
    // User picked "Default" in the /config picker — follow the leader.
    return leaderModel ?? getHardcodedTeammateModelFallback()
  }
  if (configured !== undefined) {
    return parseUserSpecifiedModel(configured)
  }
  return getHardcodedTeammateModelFallback()
}

/**
 * Resolve a teammate model value. Handles the 'inherit' alias (from agent
 * frontmatter) by substituting the leader's model. gh-31069: 'inherit' was
 * passed literally to --model, producing "It may not exist or you may not
 * have access". If leader model is null (not yet set), falls through to the
 * default.
 *
 * Exported for testing.
 */
export function resolveTeammateModel(
  inputModel: string | undefined,
  leaderModel: string | null,
): string {
  if (inputModel === 'inherit') {
    return leaderModel ?? getDefaultTeammateModel(leaderModel)
  }
  return inputModel ?? getDefaultTeammateModel(leaderModel)
}

// ============================================================================
// Types
// ============================================================================

export type SpawnOutput = {
  teammate_id: string
  agent_id: string
  agent_type?: string
  model?: string
  name: string
  color?: string
  tmux_session_name: string
  tmux_window_name: string
  tmux_pane_id: string
  team_name?: string
  is_splitpane?: boolean
  plan_mode_required?: boolean
}

export type SpawnTeammateConfig = {
  name: string
  prompt: string
  team_name?: string
  cwd?: string
  use_splitpane?: boolean
  plan_mode_required?: boolean
  model?: string
  agent_type?: string
  description?: string
  /** request_id of the API call whose response contained the tool_use that
   *  spawned this teammate. Threaded through to TeammateAgentContext for
   *  lineage tracing on tengu_api_* events. */
  invokingRequestId?: string
}

// Internal input type matching TeammateTool's spawn parameters
type SpawnInput = {
  name: string
  prompt: string
  team_name?: string
  cwd?: string
  use_splitpane?: boolean
  plan_mode_required?: boolean
  model?: string
  agent_type?: string
  description?: string
  invokingRequestId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

async function resolvePaneBackend(
  context: ToolUseContext,
): Promise<BackendDetectionResult> {
  let detectionResult = await detectAndGetBackend()

  if (detectionResult.needsIt2Setup && context.setToolJSX) {
    const tmuxAvailable = await isTmuxAvailable()
    const setupResult = await new Promise<'installed' | 'use-tmux' | 'cancelled'>(
      resolve => {
        context.setToolJSX!({
          jsx: React.createElement(It2SetupPrompt, {
            onDone: resolve,
            tmuxAvailable,
          }),
          shouldHidePromptInput: true,
        })
      },
    )

    context.setToolJSX(null)

    if (setupResult === 'cancelled') {
      throw new Error('Teammate spawn cancelled - iTerm2 setup required')
    }

    if (setupResult === 'installed' || setupResult === 'use-tmux') {
      resetBackendDetection()
      detectionResult = await detectAndGetBackend()
    }
  }

  return detectionResult
}

/**
 * Generates a unique teammate name by checking existing team members.
 * If the name already exists, appends a numeric suffix (e.g., tester-2, tester-3).
 * @internal Exported for testing
 */
export async function generateUniqueTeammateName(
  baseName: string,
  teamName: string | undefined,
): Promise<string> {
  if (!teamName) {
    return baseName
  }

  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    return baseName
  }

  const existingNames = new Set(teamFile.members.map(m => m.name.toLowerCase()))

  // If the base name doesn't exist, use it as-is
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName
  }

  // Find the next available suffix
  let suffix = 2
  while (existingNames.has(`${baseName}-${suffix}`.toLowerCase())) {
    suffix++
  }

  return `${baseName}-${suffix}`
}

async function readExistingTeamFile(teamName: string): Promise<TeamFile> {
  const teamFile = await readTeamFileAsync(teamName)
  if (!teamFile) {
    throw new Error(
      `Team "${teamName}" does not exist. Call TeamCreate first to create the team before spawning teammates.`,
    )
  }
  return teamFile
}

type NormalizedSpawnInput = {
  agent_type?: string
  description?: string
  model: string
  permissionMode: PermissionMode
  plan_mode_required?: boolean
  prompt: string
  sanitizedName: string
  teamFile: TeamFile
  teamFilePath: string
  leadAgentId: string
  teamName: string
  teammateColor: ReturnType<typeof assignTeammateColor>
  teammateId: string
  useSplitPane: boolean
  invokingRequestId?: string
  workingDir: string
  agentDefinition?: CustomAgentDefinition
}

function updateTeamContextAfterSpawn(
  context: ToolUseContext,
  normalized: NormalizedSpawnInput,
  execution: TeammateSpawnExecutionResult,
): void {
  const runtimeCwd =
    execution.backendType === 'in-process' ? getCwd() : normalized.workingDir

  context.setAppState(prev => {
    const leadAgentId =
      prev.teamContext?.leadAgentId || normalized.leadAgentId
    const existingTeammates = prev.teamContext?.teammates || {}
    const needsLeaderEntry = !(leadAgentId in existingTeammates)
    const leadMember = normalized.teamFile.members.find(
      m => m.name === TEAM_LEAD_NAME,
    )
    const leadEntry = needsLeaderEntry
      ? {
          [leadAgentId]: {
            name: TEAM_LEAD_NAME,
            agentType: leadMember?.agentType ?? TEAM_LEAD_NAME,
            color: assignTeammateColor(leadAgentId),
            tmuxSessionName:
              leadMember?.backendType === 'in-process' ? 'in-process' : '',
            tmuxPaneId: leadMember?.tmuxPaneId ?? '',
            cwd: leadMember?.cwd ?? getCwd(),
            spawnedAt: leadMember?.joinedAt ?? Date.now(),
          },
        }
      : {}

    return {
      ...prev,
      teamContext: {
        ...prev.teamContext,
        teamName: normalized.teamName ?? prev.teamContext?.teamName ?? 'default',
        teamFilePath:
          prev.teamContext?.teamFilePath || normalized.teamFilePath,
        leadAgentId,
        teammates: {
          ...existingTeammates,
          ...leadEntry,
          [normalized.teammateId]: {
            name: normalized.sanitizedName,
            agentType: normalized.agent_type,
            color: normalized.teammateColor,
            tmuxSessionName: execution.sessionName,
            tmuxPaneId: execution.paneId,
            cwd: runtimeCwd,
            spawnedAt: Date.now(),
          },
        },
      },
    }
  })
}

async function addTeammateToTeamFile(
  normalized: NormalizedSpawnInput,
  execution: TeammateSpawnExecutionResult,
): Promise<void> {
  const teamFile = await readTeamFileAsync(normalized.teamName)
  if (!teamFile) {
    throw new Error(
      `Team "${normalized.teamName}" does not exist. Call TeamCreate first to create the team before spawning teammates.`,
    )
  }

  teamFile.members.push({
    agentId: normalized.teammateId,
    name: normalized.sanitizedName,
    agentType: normalized.agent_type,
    model: normalized.model,
    prompt: normalized.prompt,
    color: normalized.teammateColor,
    planModeRequired: normalized.plan_mode_required,
    joinedAt: Date.now(),
    tmuxPaneId: execution.paneId,
    cwd:
      execution.backendType === 'in-process' ? getCwd() : normalized.workingDir,
    subscriptions: [],
    backendType: execution.backendType,
    insideTmux: execution.insideTmux,
  })
  await writeTeamFileAsync(normalized.teamName, teamFile)
}

function resolveCustomAgentDefinition(
  agentType: string | undefined,
  context: ToolUseContext,
): CustomAgentDefinition | undefined {
  if (!agentType) {
    return undefined
  }

  const agent = context.options?.agentDefinitions?.activeAgents.find(
    candidate => candidate.agentType === agentType,
  )
  if (agent && isCustomAgent(agent)) {
    return agent
  }
  return undefined
}

async function rollbackTeamFileMember(
  normalized: NormalizedSpawnInput,
): Promise<void> {
  try {
    const teamFile = await readTeamFileAsync(normalized.teamName)
    if (!teamFile) {
      return
    }

    const nextMembers = teamFile.members.filter(
      member => member.agentId !== normalized.teammateId,
    )
    if (nextMembers.length === teamFile.members.length) {
      return
    }

    await writeTeamFileAsync(normalized.teamName, {
      ...teamFile,
      members: nextMembers,
    })
  } catch (error) {
    logForDebugging(
      `[handleSpawn] Failed to roll back team file for ${normalized.teammateId}: ${errorMessage(error)}`,
    )
  }
}

function removeSpawnedTeammateFromAppState(
  context: ToolUseContext,
  normalized: NormalizedSpawnInput,
): void {
  context.setAppState(prev => {
    const tasks: typeof prev.tasks = {}
    for (const [taskId, task] of Object.entries(prev.tasks)) {
      if (
        isInProcessTeammateTask(task) &&
        task.identity.agentId === normalized.teammateId
      ) {
        continue
      }
      tasks[taskId] = task
    }

    if (!prev.teamContext?.teammates) {
      return {
        ...prev,
        tasks,
      }
    }

    const { [normalized.teammateId]: _removed, ...teammates } =
      prev.teamContext.teammates

    return {
      ...prev,
      tasks,
      teamContext: {
        ...prev.teamContext,
        teammates,
      },
    }
  })
}

async function cleanupSpawnAfterFailure(
  normalized: NormalizedSpawnInput,
  execution: TeammateSpawnExecutionResult,
  context: ToolUseContext,
): Promise<void> {
  const executor = createTeammateExecutorForMember({
    agentId: normalized.teammateId,
    name: normalized.sanitizedName,
    tmuxPaneId: execution.paneId,
    backendType: execution.backendType,
    insideTmux: execution.insideTmux,
  })

  if (executor) {
    try {
      const terminated = await executor.terminate(
        normalized.teamName,
        {
          agentId: normalized.teammateId,
          name: normalized.sanitizedName,
          tmuxPaneId: execution.paneId,
          backendType: execution.backendType,
          insideTmux: execution.insideTmux,
        },
        context,
      )
      if (!terminated) {
        logForDebugging(
          `[handleSpawn] Spawn rollback could not terminate ${normalized.teammateId}`,
        )
      }
    } catch (error) {
      logForDebugging(
        `[handleSpawn] Spawn rollback failed to terminate ${normalized.teammateId}: ${errorMessage(error)}`,
      )
    }
  }

  await rollbackTeamFileMember(normalized)
  try {
    removeSpawnedTeammateFromAppState(context, normalized)
  } catch (error) {
    logForDebugging(
      `[handleSpawn] Failed to roll back AppState for ${normalized.teammateId}: ${errorMessage(error)}`,
    )
  }
}

async function normalizeSpawnInput(
  input: SpawnInput,
  context: ToolUseContext,
): Promise<NormalizedSpawnInput> {
  const { name, prompt, cwd, agent_type, plan_mode_required, description } = input
  if (!name || !prompt) {
    throw new Error('name and prompt are required for spawn operation')
  }

  const appState = context.getAppState()
  const teamName = input.team_name || appState.teamContext?.teamName

  if (!teamName) {
    throw new Error(
      'team_name is required for spawn operation. Either provide team_name in input or call TeamCreate first to establish team context.',
    )
  }

  const teamFile = await readExistingTeamFile(teamName)

  const uniqueName = await generateUniqueTeammateName(name, teamName)
  const sanitizedName = sanitizeAgentName(uniqueName)
  const teammateId = formatAgentId(sanitizedName, teamName)
  const leadAgentId =
    teamFile.leadAgentId || formatAgentId(TEAM_LEAD_NAME, teamName)

  return {
    agent_type,
    agentDefinition: resolveCustomAgentDefinition(agent_type, context),
    description,
    model: resolveTeammateModel(input.model, appState.mainLoopModel),
    permissionMode: appState.toolPermissionContext.mode,
    plan_mode_required,
    prompt,
    sanitizedName,
    teamFile,
    teamFilePath: getTeamFilePath(teamName),
    leadAgentId,
    teamName,
    teammateColor: assignTeammateColor(teammateId),
    teammateId,
    useSplitPane: input.use_splitpane !== false,
    invokingRequestId: input.invokingRequestId,
    workingDir: cwd || getCwd(),
  }
}

async function executeSpawn(
  normalized: NormalizedSpawnInput,
  context: ToolUseContext,
): Promise<TeammateSpawnExecutionResult> {
  const request: TeammateSpawnRequest = {
    teammateId: normalized.teammateId,
    sanitizedName: normalized.sanitizedName,
    teamName: normalized.teamName,
    prompt: normalized.prompt,
    cwd: normalized.workingDir,
    teammateColor: normalized.teammateColor,
    model: normalized.model,
    agentType: normalized.agent_type,
    agentDefinition: normalized.agentDefinition,
    planModeRequired: normalized.plan_mode_required,
    description: normalized.description,
    useSplitPane: normalized.useSplitPane,
    permissionMode: normalized.permissionMode,
    invokingRequestId: normalized.invokingRequestId,
  }

  if (isInProcessEnabled()) {
    return createInProcessTeammateExecutor().spawn!(request, context)
  }

  try {
    const detectionResult = await resolvePaneBackend(context)
    return createPaneTeammateExecutor(detectionResult.backend).spawn!(
      request,
      context,
    )
  } catch (error) {
    if (getTeammateModeFromSnapshot() !== 'auto') {
      throw error
    }

    logForDebugging(
      `[handleSpawn] No pane backend available, falling back to in-process: ${errorMessage(error)}`,
    )
    markInProcessFallback()
    return createInProcessTeammateExecutor().spawn!(request, context)
  }
}

/**
 * Handle spawn operation through the teammate executor facade.
 */
async function handleSpawn(
  input: SpawnInput,
  context: ToolUseContext,
): Promise<{ data: SpawnOutput }> {
  const normalized = await normalizeSpawnInput(input, context)
  const execution = await executeSpawn(normalized, context)

  try {
    await addTeammateToTeamFile(normalized, execution)
    updateTeamContextAfterSpawn(context, normalized, execution)

    if (execution.backendType !== 'in-process') {
      await writeToMailbox(
        normalized.sanitizedName,
        {
          from: TEAM_LEAD_NAME,
          text: normalized.prompt,
          timestamp: new Date().toISOString(),
        },
        normalized.teamName,
      )
    }
  } catch (error) {
    await cleanupSpawnAfterFailure(normalized, execution, context)
    throw error
  }

  return {
    data: {
      teammate_id: normalized.teammateId,
      agent_id: normalized.teammateId,
      agent_type: normalized.agent_type,
      model: normalized.model,
      name: normalized.sanitizedName,
      color: normalized.teammateColor,
      tmux_session_name: execution.sessionName,
      tmux_window_name: execution.windowName,
      tmux_pane_id: execution.paneId,
      team_name: normalized.teamName,
      is_splitpane: execution.isSplitPane,
      plan_mode_required: normalized.plan_mode_required,
    },
  }
}

export const _registerOutOfProcessTeammateTaskForTesting =
  registerOutOfProcessTeammateTaskForTesting

export function _resetTrackedPaneCleanupForTesting(): void {
  resetTrackedPaneCleanupForTesting()
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Spawns a new teammate with the given configuration.
 * This is the main entry point for teammate spawning, used by both TeammateTool and AgentTool.
 */
export async function spawnTeammate(
  config: SpawnTeammateConfig,
  context: ToolUseContext,
): Promise<{ data: SpawnOutput }> {
  return handleSpawn(config, context)
}
