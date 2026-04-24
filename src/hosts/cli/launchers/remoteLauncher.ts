import { getRemoteSessionUrl } from '../../../constants/product.js'
import { filterCommandsForRemoteMode } from '../../../commands.js'
import { createRemoteSessionConfig } from '../../../remote/RemoteSessionManager.js'
import { launchRepl } from '../../../replLauncher.js'
import { createSystemMessage, createUserMessage } from '../../../utils/messages.js'
import { prepareApiRequest } from '../../../utils/teleport/api.js'
import { teleportToRemoteWithErrorHandling } from '../../../utils/teleport.js'
import { getBranch } from '../../../utils/git.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchReplProps,
  CliLaunchRoot,
} from './sharedLaunchContext.js'

export type RemoteLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  replProps: CliLaunchReplProps
  renderAndRun: CliLaunchRenderAndRun
  remotePrompt: string
  isRemoteTuiEnabled: boolean
  onSessionCreated(session: { id: string; title: string }): void
  stateWriter: {
    enableRemoteMode(sessionId: string): void
  }
  onConnectionError(message: string): Promise<void>
  onCreatedWithoutTui(createdSession: { id: string; title: string }): Promise<void>
}

export async function runRemoteLaunch(
  options: RemoteLaunchOptions,
): Promise<void> {
  const hasInitialPrompt = options.remotePrompt.length > 0

  if (!options.isRemoteTuiEnabled && !hasInitialPrompt) {
    return options.onConnectionError(
      'Error: --remote requires a description.\nUsage: claude --remote "your task description"',
    )
  }

  const currentBranch = await getBranch()
  const createdSession = await teleportToRemoteWithErrorHandling(
    options.root,
    hasInitialPrompt ? options.remotePrompt : null,
    new AbortController().signal,
    currentBranch || undefined,
  )

  if (!createdSession) {
    return options.onConnectionError('Error: Unable to create remote session')
  }

  options.onSessionCreated(createdSession)

  if (!options.isRemoteTuiEnabled) {
    return options.onCreatedWithoutTui(createdSession)
  }

  options.stateWriter.enableRemoteMode(createdSession.id)

  let apiCreds: { accessToken: string; orgUUID: string }
  try {
    apiCreds = await prepareApiRequest()
  } catch (error) {
    return options.onConnectionError(
      `Error: ${error instanceof Error ? error.message : 'Failed to authenticate'}`,
    )
  }

  const { getClaudeAIOAuthTokens: getTokensForRemote } = await import(
    '../../../utils/auth.js'
  )
  const getAccessTokenForRemote = (): string =>
    getTokensForRemote()?.accessToken ?? apiCreds.accessToken

  const remoteSessionConfig = createRemoteSessionConfig(
    createdSession.id,
    getAccessTokenForRemote,
    apiCreds.orgUUID,
    hasInitialPrompt,
  )

  const remoteSessionUrl = `${getRemoteSessionUrl(createdSession.id)}?m=0`
  const remoteInfoMessage = createSystemMessage(
    `/remote-control is active. Code in CLI or at ${remoteSessionUrl}`,
    'info',
  )
  const initialUserMessage = hasInitialPrompt
    ? createUserMessage({ content: options.remotePrompt })
    : null

  const remoteInitialState = {
    ...options.appProps.initialState,
    remoteSessionUrl,
  }

  await launchRepl(
    options.root,
    {
      ...options.appProps,
      initialState: remoteInitialState,
    },
    {
      ...options.replProps,
      commands: filterCommandsForRemoteMode(options.replProps.commands),
      initialTools: [],
      initialMessages: initialUserMessage
        ? [remoteInfoMessage, initialUserMessage]
        : [remoteInfoMessage],
      mcpClients: [],
      remoteSessionConfig,
    },
    options.renderAndRun,
  )
}
