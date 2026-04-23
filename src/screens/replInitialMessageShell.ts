import { buildPermissionUpdates } from '../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js'
import type { AppState } from '../state/AppStateStore.js'
import { applyPermissionUpdates } from '../utils/permissions/PermissionUpdate.js'
import { stripDangerousPermissionsForAutoMode } from '../utils/permissions/permissionSetup.js'

type InitialMessage = NonNullable<AppState['initialMessage']>

export async function runReplInitialMessageShell({
  initialMessage,
  clearContextForInitialMessage,
  setAppState,
  shouldRestrictAutoPermissions,
  createFileHistorySnapshot,
  awaitPendingHooks,
  submitInitialPrompt,
  createAbortController,
  setAbortController,
  dispatchInitialMessage,
  scheduleProcessingReset,
}: {
  initialMessage: InitialMessage
  clearContextForInitialMessage: (
    initialMessage: InitialMessage,
  ) => Promise<void>
  setAppState: (updater: (prev: AppState) => AppState) => void
  shouldRestrictAutoPermissions: boolean
  createFileHistorySnapshot: (
    messageUuid: InitialMessage['message']['uuid'],
  ) => void
  awaitPendingHooks: () => Promise<void>
  submitInitialPrompt: (content: string) => void
  createAbortController: () => AbortController
  setAbortController: (controller: AbortController | null) => void
  dispatchInitialMessage: (
    initialMessage: InitialMessage['message'],
    abortController: AbortController,
  ) => void
  scheduleProcessingReset: () => void
}): Promise<void> {
  if (initialMessage.clearContext) {
    await clearContextForInitialMessage(initialMessage)
  }

  setAppState(prev => {
    let updatedToolPermissionContext = initialMessage.mode
      ? applyPermissionUpdates(
          prev.toolPermissionContext,
          buildPermissionUpdates(
            initialMessage.mode,
            initialMessage.allowedPrompts,
          ),
        )
      : prev.toolPermissionContext

    if (
      shouldRestrictAutoPermissions &&
      initialMessage.mode === 'auto'
    ) {
      updatedToolPermissionContext = stripDangerousPermissionsForAutoMode({
        ...updatedToolPermissionContext,
        mode: 'auto',
        prePlanMode: undefined,
      })
    }

    return {
      ...prev,
      initialMessage: null,
      toolPermissionContext: updatedToolPermissionContext,
    }
  })

  createFileHistorySnapshot(initialMessage.message.uuid)
  await awaitPendingHooks()

  const content = initialMessage.message.message.content
  if (typeof content === 'string' && !initialMessage.message.planContent) {
    submitInitialPrompt(content)
  } else {
    const abortController = createAbortController()
    setAbortController(abortController)
    dispatchInitialMessage(initialMessage.message, abortController)
  }

  scheduleProcessingReset()
}
