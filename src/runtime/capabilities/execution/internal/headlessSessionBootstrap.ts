import { feature } from 'bun:bundle'
import { dirname } from 'path'
import type { AgentDefinitionsResult } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { externalMetadataToAppState } from 'src/state/onChangeAppState.js'
import type { AppState } from 'src/state/AppStateStore.js'
import { getCwd } from 'src/utils/cwd.js'
import type { SessionExternalMetadata } from 'src/utils/sessionState.js'
import { notifySessionMetadataChanged } from 'src/utils/sessionState.js'
import { restoreSessionStateFromLog } from 'src/utils/sessionRestore.js'
import { asSessionId } from 'src/types/ids.js'
import {
  resetSessionFilePointer,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
  saveAgentSetting,
  saveAiGeneratedTitle,
  saveMode,
} from 'src/utils/sessionStorage.js'
import type { RuntimeBootstrapStateProvider } from '../../../core/state/providers.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../../../../coordinator/coordinatorMode.js') as typeof import('../../../../coordinator/coordinatorMode.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

type RestorableSessionMetadata = Parameters<typeof restoreSessionMetadata>[0]
type HeadlessConversationMode = RestorableSessionMetadata['mode']

export type HeadlessLoadedConversation = RestorableSessionMetadata & {
  sessionId?: string
  fullPath?: string | null
}

export type HeadlessLoadedConversationResult = Parameters<
  typeof restoreSessionStateFromLog
>[0] &
  HeadlessLoadedConversation

type HeadlessSessionBootstrapDeps = {
  resetSessionFilePointer: () => Promise<void>
  resetSessionMetadataForResume: () => void
  restoreSessionMetadata: (meta: RestorableSessionMetadata) => void
  restoreSessionStateFromLog: typeof restoreSessionStateFromLog
  matchSessionMode?: (mode: HeadlessConversationMode) => string | undefined
  isCoordinatorMode?: () => boolean
  refreshAgentDefinitions?: () => Promise<AgentDefinitionsResult>
  saveMode?: (mode: 'coordinator' | 'normal') => void
  saveAgentSetting?: typeof saveAgentSetting
  saveAiGeneratedTitle?: typeof saveAiGeneratedTitle
  notifySessionMetadataChanged?: typeof notifySessionMetadataChanged
  writeStderr?: (message: string) => void
}

export type HeadlessSessionBootstrap = {
  applyExternalMetadata(
    metadata: SessionExternalMetadata | null,
    setAppState: (f: (prev: AppState) => AppState) => void,
  ): void
  applyLoadedConversation(
    conversation: HeadlessLoadedConversationResult,
    setAppState: (f: (prev: AppState) => AppState) => void,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void>
  applyLoadedConversationMode(
    mode: HeadlessConversationMode,
    setAppState: (f: (prev: AppState) => AppState) => void,
  ): Promise<void>
  adoptLoadedConversation(
    conversation: HeadlessLoadedConversation,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void>
  persistAgentSetting(agentType: string): void
  applyModelChange(args: {
    mainLoopModelOverride: string | undefined
    resolvedModel: string
  }): void
  persistGeneratedTitle(title: string): void
}

const defaultDeps: HeadlessSessionBootstrapDeps = {
  resetSessionFilePointer,
  resetSessionMetadataForResume,
  restoreSessionMetadata,
  restoreSessionStateFromLog,
  matchSessionMode: coordinatorModeModule?.matchSessionMode,
  isCoordinatorMode: coordinatorModeModule
    ? () => coordinatorModeModule.isCoordinatorMode()
    : undefined,
  refreshAgentDefinitions: coordinatorModeModule
    ? async () => {
        const {
          getAgentDefinitionsWithOverrides,
          getActiveAgentsFromList,
        } =
          require('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js') as typeof import('@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js')
        getAgentDefinitionsWithOverrides.cache.clear?.()
        const freshAgentDefs = await getAgentDefinitionsWithOverrides(getCwd())
        return {
          ...freshAgentDefs,
          allAgents: freshAgentDefs.allAgents,
          activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents),
        }
      }
    : undefined,
  saveMode,
  saveAgentSetting,
  saveAiGeneratedTitle,
  notifySessionMetadataChanged,
  writeStderr: message => {
    process.stderr.write(message)
  },
}

export function createHeadlessSessionBootstrap(
  bootstrapStateProvider: RuntimeBootstrapStateProvider,
  deps: HeadlessSessionBootstrapDeps = defaultDeps,
): HeadlessSessionBootstrap {
  const adoptLoadedConversation = async (
    conversation: HeadlessLoadedConversation,
    options: {
      forkSession: boolean | undefined
      persistSession: boolean
    },
  ): Promise<void> => {
    if (!options.forkSession && conversation.sessionId) {
      bootstrapStateProvider.switchSession(
        asSessionId(conversation.sessionId),
        conversation.fullPath ? dirname(conversation.fullPath) : null,
      )
      if (options.persistSession) {
        await deps.resetSessionFilePointer()
      }
    }

    deps.resetSessionMetadataForResume()
    deps.restoreSessionMetadata(
      options.forkSession
        ? { ...conversation, worktreeSession: undefined }
        : conversation,
    )
  }

  return {
    applyExternalMetadata(metadata, setAppState) {
      if (!metadata) {
        return
      }

      setAppState(externalMetadataToAppState(metadata))
      if (typeof metadata.model === 'string') {
        bootstrapStateProvider.patchPromptState({
          mainLoopModelOverride: metadata.model,
        })
      }
    },

    async applyLoadedConversation(conversation, setAppState, options) {
      deps.restoreSessionStateFromLog(conversation, setAppState)
      await adoptLoadedConversation(conversation, options)
    },

    async applyLoadedConversationMode(mode, setAppState) {
      const warning = deps.matchSessionMode?.(mode)
      if (warning) {
        deps.writeStderr?.(`${warning}\n`)
        const freshAgentDefs = await deps.refreshAgentDefinitions?.()
        if (freshAgentDefs) {
          setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: freshAgentDefs.activeAgents,
            },
          }))
        }
      }

      if (deps.isCoordinatorMode && deps.saveMode) {
        deps.saveMode(
          deps.isCoordinatorMode() ? 'coordinator' : 'normal',
        )
      }
    },

    async adoptLoadedConversation(conversation, options) {
      await adoptLoadedConversation(conversation, options)
    },

    persistAgentSetting(agentType) {
      deps.saveAgentSetting?.(agentType)
    },

    applyModelChange({ mainLoopModelOverride, resolvedModel }) {
      bootstrapStateProvider.patchPromptState({
        mainLoopModelOverride,
      })
      deps.notifySessionMetadataChanged?.({ model: resolvedModel })
    },

    persistGeneratedTitle(title) {
      const sessionId = bootstrapStateProvider.getSessionIdentity().sessionId
      deps.saveAiGeneratedTitle?.(
        sessionId as Parameters<typeof saveAiGeneratedTitle>[0],
        title,
      )
    },
  }
}
