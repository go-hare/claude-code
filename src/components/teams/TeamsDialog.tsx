import { randomUUID } from 'crypto'
import figures from 'figures'
import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useInterval } from 'usehooks-ts'
import { useRegisterOverlay } from '../../context/overlayContext.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw j/k/arrow dialog navigation
import { Box, Text, useInput, stringWidth } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js'
import {
  type AppState,
  useAppState,
  useSetAppState,
} from '../../state/AppState.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { AGENT_COLOR_TO_THEME_COLOR } from '@go-hare/builtin-tools/tools/AgentTool/agentColorManager.js'
import { logForDebugging } from '../../utils/debug.js'
import * as execFileUtils from '../../utils/execFileNoThrow.js'
import { truncateToWidth } from '../../utils/format.js'
import { getNextPermissionMode } from '../../utils/permissions/getNextPermissionMode.js'
import {
  getModeColor,
  type PermissionMode,
  permissionModeFromString,
  permissionModeSymbol,
} from '../../utils/permissions/PermissionMode.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import * as backendDetection from '../../utils/swarm/backends/detection.js'
import * as backendRegistry from '../../utils/swarm/backends/registry.js'
import { isPaneBackend, type PaneBackendType } from '../../utils/swarm/backends/types.js'
import {
  getSwarmSocketName,
  TMUX_COMMAND,
} from '../../utils/swarm/constants.js'
import * as teamHelpers from '../../utils/swarm/teamHelpers.js'
import type { Task } from '../../utils/tasks.js'
import * as tasks from '../../utils/tasks.js'
import {
  getTeammateStatuses,
  type TeammateStatus,
  type TeamSummary,
} from '../../utils/teamDiscovery.js'
import {
  createModeSetRequestMessage,
  writeToMailbox,
} from '../../utils/teammateMailbox.js'
import * as teammateLifecycle from '../../utils/swarm/teammateLifecycle.js'
import { Dialog } from '@anthropic/ink'
import ThemedText from '../design-system/ThemedText.js'

type Props = {
  initialTeams?: TeamSummary[]
  onDone: () => void
}

type DialogLevel =
  | { type: 'teammateList'; teamName: string }
  | { type: 'teammateDetail'; teamName: string; memberName: string }

/**
 * Dialog for viewing teammates in the current team
 */
export function TeamsDialog({ initialTeams, onDone }: Props): React.ReactNode {
  // Register as overlay so CancelRequestHandler doesn't intercept escape
  useRegisterOverlay('teams-dialog')

  // initialTeams is derived from teamContext in PromptInput (no filesystem I/O)
  const setAppState = useSetAppState()
  const tasks = useAppState(s => s.tasks)

  // Initialize dialogLevel with first team name if available
  const firstTeamName = initialTeams?.[0]?.name ?? ''
  const [dialogLevel, setDialogLevel] = useState<DialogLevel>({
    type: 'teammateList',
    teamName: firstTeamName,
  })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  // initialTeams is now always provided from PromptInput (derived from teamContext)
  // No filesystem I/O needed here

  const teammateStatuses = useMemo(() => {
    return getTeammateStatuses(dialogLevel.teamName)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  }, [dialogLevel.teamName, refreshKey])

  // Periodically refresh to pick up mode changes from teammates
  useInterval(() => {
    setRefreshKey(k => k + 1)
  }, 1000)

  const currentTeammate = useMemo(() => {
    if (dialogLevel.type !== 'teammateDetail') return null
    return teammateStatuses.find(t => t.name === dialogLevel.memberName) ?? null
  }, [dialogLevel, teammateStatuses])

  // Get isBypassPermissionsModeAvailable from AppState
  const isBypassAvailable = useAppState(
    s => s.toolPermissionContext.isBypassPermissionsModeAvailable,
  )

  const goBackToList = (): void => {
    setDialogLevel({ type: 'teammateList', teamName: dialogLevel.teamName })
    setSelectedIndex(0)
  }

  // Handler for confirm:cycleMode - cycle teammate permission modes
  const handleCycleMode = useCallback(() => {
    if (dialogLevel.type === 'teammateDetail' && currentTeammate) {
      // Detail view: cycle just this teammate
      cycleTeammateMode(
        currentTeammate,
        dialogLevel.teamName,
        isBypassAvailable,
      )
      setRefreshKey(k => k + 1)
    } else if (
      dialogLevel.type === 'teammateList' &&
      teammateStatuses.length > 0
    ) {
      // List view: cycle all teammates in tandem
      cycleAllTeammateModes(
        teammateStatuses,
        dialogLevel.teamName,
        isBypassAvailable,
      )
      setRefreshKey(k => k + 1)
    }
  }, [dialogLevel, currentTeammate, teammateStatuses, isBypassAvailable])

  // Use keybindings for mode cycling
  useKeybindings(
    { 'confirm:cycleMode': handleCycleMode },
    { context: 'Confirmation' },
  )

  useInput((input, key) => {
    // Handle left arrow to go back
    if (key.leftArrow) {
      if (dialogLevel.type === 'teammateDetail') {
        goBackToList()
      }
      return
    }

    // Handle up/down navigation
    if (key.upArrow || key.downArrow) {
      const maxIndex = getMaxIndex()
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1))
      } else {
        setSelectedIndex(prev => Math.min(maxIndex, prev + 1))
      }
      return
    }

    // Handle Enter to drill down or view output
    if (key.return) {
      if (
        dialogLevel.type === 'teammateList' &&
        teammateStatuses[selectedIndex]
      ) {
        setDialogLevel({
          type: 'teammateDetail',
          teamName: dialogLevel.teamName,
          memberName: teammateStatuses[selectedIndex].name,
        })
      } else if (dialogLevel.type === 'teammateDetail' && currentTeammate) {
        // View output - switch to teammate pane, or surface a notice if unsupported
        void viewTeammateOutput(
          currentTeammate.tmuxPaneId,
          currentTeammate.backendType && isPaneBackend(currentTeammate.backendType)
            ? currentTeammate.backendType
            : undefined,
        ).then(notice => {
          if (notice) {
            setAppState(prev => ({
              ...prev,
              inbox: {
                messages: [
                  ...prev.inbox.messages,
                  {
                    id: randomUUID(),
                    from: 'system',
                    text: jsonStringify({
                      type: 'teammate_terminated',
                      message: notice,
                    }),
                    timestamp: new Date().toISOString(),
                    status: 'pending' as const,
                  },
                ],
              },
            }))
          }
          onDone()
        })
      }
      return
    }

    // Handle 'k' to kill teammate
    if (input === 'k') {
      if (
        dialogLevel.type === 'teammateList' &&
        teammateStatuses[selectedIndex]
      ) {
        void killTeammate(
          teammateStatuses[selectedIndex],
          dialogLevel.teamName,
          {
            getAppState: () => ({ tasks }),
            setAppState,
          },
        ).then(() => {
          setRefreshKey(k => k + 1)
          // Adjust selection if needed
          setSelectedIndex(prev =>
            Math.max(0, Math.min(prev, teammateStatuses.length - 2)),
          )
        })
      } else if (dialogLevel.type === 'teammateDetail' && currentTeammate) {
        void killTeammate(
          currentTeammate,
          dialogLevel.teamName,
          {
            getAppState: () => ({ tasks }),
            setAppState,
          },
        )
        goBackToList()
      }
      return
    }

    // Handle 's' for shutdown of selected teammate
    if (input === 's') {
      if (
        dialogLevel.type === 'teammateList' &&
        teammateStatuses[selectedIndex]
      ) {
        const teammate = teammateStatuses[selectedIndex]
        void teammateLifecycle.requestTeammateShutdown(
          dialogLevel.teamName,
          teammate,
          {
            getAppState: () => ({ tasks }),
            setAppState,
          },
          'Graceful shutdown requested by team lead',
        )
      } else if (dialogLevel.type === 'teammateDetail' && currentTeammate) {
        void teammateLifecycle.requestTeammateShutdown(
          dialogLevel.teamName,
          currentTeammate,
          {
            getAppState: () => ({ tasks }),
            setAppState,
          },
          'Graceful shutdown requested by team lead',
        )
        goBackToList()
      }
      return
    }

    // Handle 'h' to hide/show individual teammate (only for backends that support it)
    if (input === 'h') {
      const backend = backendRegistry.getCachedBackend()
      const teammate =
        dialogLevel.type === 'teammateList'
          ? teammateStatuses[selectedIndex]
          : dialogLevel.type === 'teammateDetail'
            ? currentTeammate
            : null

      if (teammate && backend?.supportsHideShow) {
        void toggleTeammateVisibility(teammate, dialogLevel.teamName).then(
          () => {
            // Force refresh of teammate statuses
            setRefreshKey(k => k + 1)
          },
        )
        if (dialogLevel.type === 'teammateDetail') {
          goBackToList()
        }
      }
      return
    }

    // Handle 'H' to hide/show all teammates (only for backends that support it)
    if (input === 'H' && dialogLevel.type === 'teammateList') {
      const backend = backendRegistry.getCachedBackend()
      if (backend?.supportsHideShow && teammateStatuses.length > 0) {
        // If any are visible, hide all. Otherwise, show all.
        const anyVisible = teammateStatuses.some(t => !t.isHidden)
        void Promise.all(
          teammateStatuses.map(t =>
            anyVisible
              ? hideTeammate(t, dialogLevel.teamName)
              : showTeammate(t, dialogLevel.teamName),
          ),
        ).then(() => {
          // Force refresh of teammate statuses
          setRefreshKey(k => k + 1)
        })
      }
      return
    }

    // Handle 'p' to prune (kill) all idle teammates
    if (input === 'p' && dialogLevel.type === 'teammateList') {
      const idleTeammates = teammateStatuses.filter(t => t.status === 'idle')
      if (idleTeammates.length > 0) {
        void Promise.all(
          idleTeammates.map(t =>
            killTeammate(
              t,
              dialogLevel.teamName,
              {
                getAppState: () => ({ tasks }),
                setAppState,
              },
            ),
          ),
        ).then(() => {
          setRefreshKey(k => k + 1)
          setSelectedIndex(prev =>
            Math.max(
              0,
              Math.min(
                prev,
                teammateStatuses.length - idleTeammates.length - 1,
              ),
            ),
          )
        })
      }
      return
    }

    // Note: Mode cycling (shift+tab) is handled via useKeybindings with confirm:cycleMode action
  })

  function getMaxIndex(): number {
    if (dialogLevel.type === 'teammateList') {
      return Math.max(0, teammateStatuses.length - 1)
    }
    return 0
  }

  // Render based on dialog level
  if (dialogLevel.type === 'teammateList') {
    return (
      <TeamDetailView
        teamName={dialogLevel.teamName}
        teammates={teammateStatuses}
        selectedIndex={selectedIndex}
        onCancel={onDone}
      />
    )
  }

  if (dialogLevel.type === 'teammateDetail' && currentTeammate) {
    return (
      <TeammateDetailView
        teammate={currentTeammate}
        teamName={dialogLevel.teamName}
        onCancel={goBackToList}
      />
    )
  }

  return null
}

type TeamDetailViewProps = {
  teamName: string
  teammates: TeammateStatus[]
  selectedIndex: number
  onCancel: () => void
}

function TeamDetailView({
  teamName,
  teammates,
  selectedIndex,
  onCancel,
}: TeamDetailViewProps): React.ReactNode {
  const subtitle = `${teammates.length} ${teammates.length === 1 ? 'teammate' : 'teammates'}`
  // Check if the backend supports hide/show
  const supportsHideShow = backendRegistry.getCachedBackend()?.supportsHideShow ?? false
  // Get the display text for the cycle mode shortcut
  const cycleModeShortcut = useShortcutDisplay(
    'confirm:cycleMode',
    'Confirmation',
    'shift+tab',
  )

  return (
    <>
      <Dialog
        title={`Team ${teamName}`}
        subtitle={subtitle}
        onCancel={onCancel}
        color="background"
        hideInputGuide
      >
        {teammates.length === 0 ? (
          <Text dimColor>No teammates</Text>
        ) : (
          <Box flexDirection="column">
            {teammates.map((teammate, index) => (
              <TeammateListItem
                key={teammate.agentId}
                teammate={teammate}
                isSelected={index === selectedIndex}
              />
            ))}
          </Box>
        )}
      </Dialog>
      <Box marginLeft={1}>
        <Text dimColor>
          {figures.arrowUp}/{figures.arrowDown} select · Enter view · k kill · s
          shutdown · p prune idle
          {supportsHideShow && ' · h hide/show · H hide/show all'}
          {' · '}
          {cycleModeShortcut} sync cycle modes for all · Esc close
        </Text>
      </Box>
    </>
  )
}

type TeammateListItemProps = {
  teammate: TeammateStatus
  isSelected: boolean
}

function TeammateListItem({
  teammate,
  isSelected,
}: TeammateListItemProps): React.ReactNode {
  const isIdle = teammate.status === 'idle'
  // Only dim if idle AND not selected - selection highlighting takes precedence
  const shouldDim = isIdle && !isSelected

  // Get mode display
  const mode = teammate.mode
    ? permissionModeFromString(teammate.mode)
    : 'default'
  const modeSymbol = permissionModeSymbol(mode)
  const modeColor = getModeColor(mode)

  return (
    <Text color={isSelected ? 'suggestion' : undefined} dimColor={shouldDim}>
      {isSelected ? figures.pointer + ' ' : '  '}
      {teammate.isHidden && <Text dimColor>[hidden] </Text>}
      {isIdle && <Text dimColor>[idle] </Text>}
      {modeSymbol && <Text color={modeColor}>{modeSymbol} </Text>}@
      {teammate.name}
      {teammate.model && <Text dimColor> ({teammate.model})</Text>}
    </Text>
  )
}

type TeammateDetailViewProps = {
  teammate: TeammateStatus
  teamName: string
  onCancel: () => void
}

function TeammateDetailView({
  teammate,
  teamName,
  onCancel,
}: TeammateDetailViewProps): React.ReactNode {
  const [promptExpanded, setPromptExpanded] = useState(false)
  // Get the display text for the cycle mode shortcut
  const cycleModeShortcut = useShortcutDisplay(
    'confirm:cycleMode',
    'Confirmation',
    'shift+tab',
  )
  const themeColor = teammate.color
    ? AGENT_COLOR_TO_THEME_COLOR[
        teammate.color as keyof typeof AGENT_COLOR_TO_THEME_COLOR
      ]
    : undefined

  // Get tasks assigned to this teammate
  const [teammateTasks, setTeammateTasks] = useState<Task[]>([])
  useEffect(() => {
    let cancelled = false
    void tasks.listTasks(teamName).then(allTasks => {
      if (cancelled) return
      // Filter tasks owned by this teammate (by agentId or name)
      setTeammateTasks(
        allTasks.filter(
          task =>
            task.owner === teammate.agentId || task.owner === teammate.name,
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [teamName, teammate.agentId, teammate.name])

  useInput(input => {
    // Handle 'p' to expand/collapse prompt
    if (input === 'p') {
      setPromptExpanded(prev => !prev)
    }
  })

  // Determine working directory display
  const workingPath = teammate.worktreePath || teammate.cwd

  // Build subtitle with metadata
  const subtitleParts: string[] = []
  if (teammate.model) subtitleParts.push(teammate.model)
  if (workingPath) {
    subtitleParts.push(
      teammate.worktreePath ? `worktree: ${workingPath}` : workingPath,
    )
  }
  const subtitle = subtitleParts.join(' · ') || undefined

  // Get mode display for title
  const mode = teammate.mode
    ? permissionModeFromString(teammate.mode)
    : 'default'
  const modeSymbol = permissionModeSymbol(mode)
  const modeColor = getModeColor(mode)

  // Build title with mode symbol and colored name if applicable
  const title = (
    <>
      {modeSymbol && <Text color={modeColor}>{modeSymbol} </Text>}
      {themeColor ? (
        <ThemedText color={themeColor}>{`@${teammate.name}`}</ThemedText>
      ) : (
        `@${teammate.name}`
      )}
    </>
  )

  return (
    <>
      <Dialog
        title={title}
        subtitle={subtitle}
        onCancel={onCancel}
        color="background"
        hideInputGuide
      >
        {/* Tasks section */}
        {teammateTasks.length > 0 && (
          <Box flexDirection="column">
            <Text bold>Tasks</Text>
            {teammateTasks.map(task => (
              <Text
                key={task.id}
                color={task.status === 'completed' ? 'success' : undefined}
              >
                {task.status === 'completed' ? figures.tick : '◼'}{' '}
                {task.subject}
              </Text>
            ))}
          </Box>
        )}

        {/* Prompt section */}
        {teammate.prompt && (
          <Box flexDirection="column">
            <Text bold>Prompt</Text>
            <Text>
              {promptExpanded
                ? teammate.prompt
                : truncateToWidth(teammate.prompt, 80)}
              {stringWidth(teammate.prompt) > 80 && !promptExpanded && (
                <Text dimColor> (p to expand)</Text>
              )}
            </Text>
          </Box>
        )}
      </Dialog>
      <Box marginLeft={1}>
        <Text dimColor>
          {figures.arrowLeft} back · Esc close · k kill · s shutdown
          {backendRegistry.getCachedBackend()?.supportsHideShow &&
            ' · h hide/show'}
          {' · '}
          {cycleModeShortcut} cycle mode
        </Text>
      </Box>
    </>
  )
}

export async function killTeammate(
  teammate: Pick<
    TeammateStatus,
    'agentId' | 'backendType' | 'name' | 'tmuxPaneId'
  >,
  teamName: string,
  context: {
    getAppState(): Pick<AppState, 'tasks'>
    setAppState: (f: (prev: AppState) => AppState) => void
  },
): Promise<void> {
  await teammateLifecycle.terminateTeammate(teamName, teammate, context)
  // Remove from team config file
  removeTerminatedTeammateFromTeamConfig(
    teamName,
    teammate.tmuxPaneId,
    teammate.agentId,
  )

  // Unassign tasks and build notification message
  const { notificationMessage } = await tasks.unassignTeammateTasks(
    teamName,
    teammate.agentId,
    teammate.name,
    'terminated',
  )

  // Update AppState to keep status line in sync and notify the lead
  context.setAppState(prev => {
    if (!prev.teamContext?.teammates) return prev
    if (!(teammate.agentId in prev.teamContext.teammates)) return prev
    const { [teammate.agentId]: _, ...remainingTeammates } =
      prev.teamContext.teammates
    return {
      ...prev,
      teamContext: {
        ...prev.teamContext,
        teammates: remainingTeammates,
      },
      inbox: {
        messages: [
          ...prev.inbox.messages,
          {
            id: randomUUID(),
            from: 'system',
            text: jsonStringify({
              type: 'teammate_terminated',
              message: notificationMessage,
            }),
            timestamp: new Date().toISOString(),
            status: 'pending' as const,
          },
        ],
      },
    }
  })
  logForDebugging(`[TeamsDialog] Removed ${teammate.agentId} from teamContext`)
}

export function removeTerminatedTeammateFromTeamConfig(
  teamName: string,
  paneId: string,
  teammateId: string,
): boolean {
  if (paneId === 'in-process') {
    return teamHelpers.removeMemberByAgentId(teamName, teammateId)
  }
  return teamHelpers.removeMemberFromTeam(teamName, paneId)
}

export async function viewTeammateOutput(
  paneId: string,
  backendType: PaneBackendType | undefined,
): Promise<string | null> {
  if (backendType === 'iterm2') {
    // -s is required to target a specific session (ITermBackend.ts:216-217)
    await execFileUtils.execFileNoThrow(backendDetection.IT2_COMMAND, [
      'session',
      'focus',
      '-s',
      paneId,
    ])
    return null
  }

  if (backendType === 'windows-terminal') {
    logForDebugging(
      `[TeamsDialog] viewTeammateOutput: Windows Terminal pane ${paneId} — manual tab switch required`,
    )
    return 'Windows Terminal cannot focus teammate output automatically yet. Switch to the teammate tab manually to view its output.'
  }

  // External-tmux teammates live on the swarm socket — without -L, this
  // targets the default server and silently no-ops. Mirrors runTmuxInSwarm
  // in TmuxBackend.ts:85-89.
  const args = backendDetection.isInsideTmuxSync()
    ? ['select-pane', '-t', paneId]
    : ['-L', getSwarmSocketName(), 'select-pane', '-t', paneId]
  await execFileUtils.execFileNoThrow(TMUX_COMMAND, args)
  return null
}

/**
 * Toggle visibility of a teammate pane (hide if visible, show if hidden)
 */
async function toggleTeammateVisibility(
  teammate: TeammateStatus,
  teamName: string,
): Promise<void> {
  if (teammate.isHidden) {
    await showTeammate(teammate, teamName)
  } else {
    await hideTeammate(teammate, teamName)
  }
}

/**
 * Hide a teammate pane using the backend abstraction.
 * Only available for ant users (gated for dead code elimination in external builds)
 */
export async function hideTeammate(
  teammate: TeammateStatus,
  teamName: string,
): Promise<void> {
  if (!teammate.backendType || !isPaneBackend(teammate.backendType)) {
    return
  }

  await backendRegistry.ensureBackendsRegistered()
  const hidden = await backendRegistry.getBackendByType(
    teammate.backendType,
  ).hidePane(
    teammate.tmuxPaneId,
    !backendDetection.isInsideTmuxSync(),
  )
  if (hidden) {
    teamHelpers.addHiddenPaneId(teamName, teammate.tmuxPaneId)
    logForDebugging(
      `[TeamsDialog] Hid teammate ${teammate.name} (${teammate.tmuxPaneId})`,
    )
  }
}

/**
 * Show a previously hidden teammate pane using the backend abstraction.
 * Only available for ant users (gated for dead code elimination in external builds)
 */
export async function showTeammate(
  teammate: TeammateStatus,
  teamName: string,
): Promise<void> {
  if (!teammate.backendType || !isPaneBackend(teammate.backendType)) {
    return
  }

  await backendRegistry.ensureBackendsRegistered()
  const shown = await backendRegistry.getBackendByType(
    teammate.backendType,
  ).showPane(
    teammate.tmuxPaneId,
    teammate.tmuxPaneId,
    !backendDetection.isInsideTmuxSync(),
  )
  if (shown) {
    teamHelpers.removeHiddenPaneId(teamName, teammate.tmuxPaneId)
    logForDebugging(
      `[TeamsDialog] Showed teammate ${teammate.name} (${teammate.tmuxPaneId})`,
    )
  }
}

/**
 * Send a mode change message to a single teammate
 * Also updates config.json directly so the UI reflects the change immediately
 */
function sendModeChangeToTeammate(
  teammateName: string,
  teamName: string,
  targetMode: PermissionMode,
): void {
  // Update config.json directly so UI shows the change immediately
  teamHelpers.setMemberMode(teamName, teammateName, targetMode)

  // Also send message so teammate updates their local permission context
  const message = createModeSetRequestMessage({
    mode: targetMode,
    from: 'team-lead',
  })
  void writeToMailbox(
    teammateName,
    {
      from: 'team-lead',
      text: jsonStringify(message),
      timestamp: new Date().toISOString(),
    },
    teamName,
  )
  logForDebugging(
    `[TeamsDialog] Sent mode change to ${teammateName}: ${targetMode}`,
  )
}

/**
 * Cycle a single teammate's mode
 */
function cycleTeammateMode(
  teammate: TeammateStatus,
  teamName: string,
  isBypassAvailable: boolean,
): void {
  const currentMode = teammate.mode
    ? permissionModeFromString(teammate.mode)
    : 'default'
  const context = {
    ...getEmptyToolPermissionContext(),
    mode: currentMode,
    isBypassPermissionsModeAvailable: isBypassAvailable,
  }
  const nextMode = getNextPermissionMode(context)
  sendModeChangeToTeammate(teammate.name, teamName, nextMode)
}

/**
 * Cycle all teammates' modes in tandem
 * If modes differ, reset all to default first
 * If same, cycle all to next mode
 * Uses batch update to avoid race conditions
 */
function cycleAllTeammateModes(
  teammates: TeammateStatus[],
  teamName: string,
  isBypassAvailable: boolean,
): void {
  if (teammates.length === 0) return

  const modes = teammates.map(t =>
    t.mode ? permissionModeFromString(t.mode) : 'default',
  )
  const allSame = modes.every(m => m === modes[0])

  // Determine target mode for all teammates
  const targetMode = !allSame
    ? 'default'
    : getNextPermissionMode({
        ...getEmptyToolPermissionContext(),
        mode: modes[0] ?? 'default',
        isBypassPermissionsModeAvailable: isBypassAvailable,
      })

  // Batch update config.json in a single atomic operation
  const modeUpdates = teammates.map(t => ({
    memberName: t.name,
    mode: targetMode,
  }))
  teamHelpers.setMultipleMemberModes(teamName, modeUpdates)

  // Send mailbox messages to each teammate
  for (const teammate of teammates) {
    const message = createModeSetRequestMessage({
      mode: targetMode,
      from: 'team-lead',
    })
    void writeToMailbox(
      teammate.name,
      {
        from: 'team-lead',
        text: jsonStringify(message),
        timestamp: new Date().toISOString(),
      },
      teamName,
    )
  }
  logForDebugging(
    `[TeamsDialog] Sent mode change to all ${teammates.length} teammates: ${targetMode}`,
  )
}
