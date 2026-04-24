import { createSystemMessage } from '../../../utils/messages.js'
import { launchRepl } from '../../../replLauncher.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchReplProps,
  CliLaunchRoot,
} from './sharedLaunchContext.js'

type SSHPermissionMode = string | undefined

type SSHSession = {
  remoteCwd: string
}

export type SSHLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  replProps: CliLaunchReplProps
  renderAndRun: CliLaunchRenderAndRun
  ssh: {
    host?: string
    cwd?: string
    local?: boolean
    permissionMode?: SSHPermissionMode
    dangerouslySkipPermissions?: boolean
    extraCliArgs?: string[]
  }
  localVersion: string
  stateWriter: {
    setOriginalCwd(cwd: string): void
    setCwdState(cwd: string): void
    setDirectConnectServerUrl(url: string): void
  }
  onConnectionError(message: string): Promise<void>
  stderr: {
    write(message: string): void
    isTTY: boolean | undefined
  }
}

export async function runSshRemoteLaunch(
  options: SSHLaunchOptions,
): Promise<void> {
  const sshServerUrl = options.ssh.local ? 'local' : options.ssh.host!
  const {
    createSSHSession,
    createLocalSSHSession,
    SSHSessionError,
  } = await import('../../../ssh/createSSHSession.js')

  let sshSession: SSHSession
  try {
    if (options.ssh.local) {
      options.stderr.write('Starting local ssh-proxy test session...\n')
      sshSession = await createLocalSSHSession({
        cwd: options.ssh.cwd,
        permissionMode: options.ssh.permissionMode,
        dangerouslySkipPermissions: options.ssh.dangerouslySkipPermissions,
      })
    } else {
      options.stderr.write(`Connecting to ${options.ssh.host}...\n`)
      const isTTY = !!options.stderr.isTTY
      let hadProgress = false
      sshSession = await createSSHSession(
        {
          host: options.ssh.host,
          cwd: options.ssh.cwd,
          localVersion: options.localVersion,
          permissionMode: options.ssh.permissionMode,
          dangerouslySkipPermissions: options.ssh.dangerouslySkipPermissions,
          extraCliArgs: options.ssh.extraCliArgs,
        },
        isTTY
          ? {
              onProgress: (message: string) => {
                hadProgress = true
                options.stderr.write(`\r  ${message}\x1b[K`)
              },
            }
          : {},
      )
      if (hadProgress) {
        options.stderr.write('\n')
      }
    }
  } catch (error) {
    return options.onConnectionError(
      error instanceof SSHSessionError ? error.message : String(error),
    )
  }

  options.stateWriter.setOriginalCwd(sshSession.remoteCwd)
  options.stateWriter.setCwdState(sshSession.remoteCwd)
  options.stateWriter.setDirectConnectServerUrl(sshServerUrl)

  const sshInfoMessage = createSystemMessage(
    options.ssh.local
      ? `Local ssh-proxy test session\ncwd: ${sshSession.remoteCwd}\nAuth: unix socket -> local proxy`
      : `SSH session to ${sshServerUrl}\nRemote cwd: ${sshSession.remoteCwd}\nAuth: unix socket -R -> local proxy`,
    'info',
  )

  await launchRepl(
    options.root,
    options.appProps,
    {
      ...options.replProps,
      initialTools: [],
      initialMessages: [sshInfoMessage],
      mcpClients: [],
      sshSession: sshSession as never,
    },
    options.renderAndRun,
  )
}
