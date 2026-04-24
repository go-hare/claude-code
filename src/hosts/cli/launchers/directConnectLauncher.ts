import {
  connectDirectHostSession,
  getDirectConnectErrorMessage,
} from '../../../kernel/index.js'
import { launchRepl } from '../../../replLauncher.js'
import { createSystemMessage } from '../../../utils/messages.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchReplProps,
  CliLaunchRoot,
} from './sharedLaunchContext.js'

export type DirectConnectLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  replProps: CliLaunchReplProps
  renderAndRun: CliLaunchRenderAndRun
  connect: Parameters<typeof connectDirectHostSession>[0]
  stateWriter: Parameters<typeof connectDirectHostSession>[1]
  onConnectionError(message: string): Promise<void>
}

export async function runDirectConnectLaunch(
  options: DirectConnectLaunchOptions,
): Promise<void> {
  let directConnectConfig
  try {
    directConnectConfig = await connectDirectHostSession(
      options.connect,
      options.stateWriter,
    )
  } catch (error) {
    return options.onConnectionError(getDirectConnectErrorMessage(error))
  }

  const connectInfoMessage = createSystemMessage(
    `Connected to server at ${options.connect.serverUrl}\nSession: ${directConnectConfig.sessionId}`,
    'info',
  )

  await launchRepl(
    options.root,
    options.appProps,
    {
      ...options.replProps,
      initialTools: [],
      initialMessages: [connectInfoMessage],
      mcpClients: [],
      directConnectConfig,
    },
    options.renderAndRun,
  )
}
