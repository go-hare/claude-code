import { filterCommandsForRemoteMode } from '../../../commands.js'
import { createSystemMessage } from '../../../utils/messages.js'
import { launchRepl } from '../../../replLauncher.js'
import { createRemoteSessionConfig } from '../../../remote/RemoteSessionManager.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchReplProps,
  CliLaunchRoot,
} from './sharedLaunchContext.js'

export type AssistantChatLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  replProps: CliLaunchReplProps
  renderAndRun: CliLaunchRenderAndRun
  assistant: {
    sessionId?: string
    discover: boolean
  }
  stateWriter: {
    enableRemoteAssistantMode(): void
  }
  onConnectionError(message: string): Promise<void>
  onCancelled(): Promise<void>
  onInstalled(installedDir: string): Promise<void>
}

export async function runAssistantChatLaunch(
  options: AssistantChatLaunchOptions,
): Promise<void> {
  let targetSessionId = options.assistant.sessionId

  if (!targetSessionId) {
    const { discoverAssistantSessions } = await import(
      '../../../assistant/sessionDiscovery.js'
    )
    let sessions
    try {
      sessions = await discoverAssistantSessions()
    } catch (error) {
      return options.onConnectionError(
        `Failed to discover sessions: ${error instanceof Error ? error.message : error}`,
      )
    }

    if (sessions.length === 0) {
      const { launchAssistantInstallWizard } = await import(
        '../../../dialogLaunchers.js'
      )
      let installedDir: string | null
      try {
        installedDir = await launchAssistantInstallWizard(options.root)
      } catch (error) {
        return options.onConnectionError(
          `Assistant installation failed: ${error instanceof Error ? error.message : error}`,
        )
      }

      if (installedDir === null) {
        return options.onCancelled()
      }

      return options.onInstalled(installedDir)
    }

    if (sessions.length === 1) {
      targetSessionId = sessions[0]!.id
    } else {
      const { launchAssistantSessionChooser } = await import(
        '../../../dialogLaunchers.js'
      )
      const picked = await launchAssistantSessionChooser(options.root, {
        sessions,
      })
      if (!picked) {
        return options.onCancelled()
      }
      targetSessionId = picked
    }
  }

  const {
    checkAndRefreshOAuthTokenIfNeeded,
    getClaudeAIOAuthTokens,
  } = await import('../../../utils/auth.js')
  const { prepareApiRequest } = await import(
    '../../../utils/teleport/api.js'
  )

  await checkAndRefreshOAuthTokenIfNeeded()

  let apiCreds: { accessToken: string; orgUUID: string }
  try {
    apiCreds = await prepareApiRequest()
  } catch (error) {
    return options.onConnectionError(
      `Error: ${error instanceof Error ? error.message : 'Failed to authenticate'}`,
    )
  }

  const getAccessToken = (): string =>
    getClaudeAIOAuthTokens()?.accessToken ?? apiCreds.accessToken

  options.stateWriter.enableRemoteAssistantMode()

  const remoteSessionConfig = createRemoteSessionConfig(
    targetSessionId,
    getAccessToken,
    apiCreds.orgUUID,
    false,
    true,
  )

  const infoMessage = createSystemMessage(
    `Attached to assistant session ${targetSessionId.slice(0, 8)}…`,
    'info',
  )

  const assistantInitialState = {
    ...options.appProps.initialState,
    isBriefOnly: true,
    kairosEnabled: false,
    replBridgeEnabled: false,
  }

  await launchRepl(
    options.root,
    {
      ...options.appProps,
      initialState: assistantInitialState,
    },
    {
      ...options.replProps,
      commands: filterCommandsForRemoteMode(options.replProps.commands),
      initialTools: [],
      initialMessages: [infoMessage],
      mcpClients: [],
      remoteSessionConfig,
    },
    options.renderAndRun,
  )
}
