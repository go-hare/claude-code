import { launchRepl } from '../../../replLauncher.js'

export type CliLaunchRoot = Parameters<typeof launchRepl>[0]
export type CliLaunchAppProps = {
  getFpsMetrics: Parameters<typeof launchRepl>[1]['getFpsMetrics']
  stats: NonNullable<Parameters<typeof launchRepl>[1]['stats']>
  initialState: Parameters<typeof launchRepl>[1]['initialState']
}
export type CliLaunchReplProps = Pick<
  Parameters<typeof launchRepl>[2],
  | 'debug'
  | 'commands'
  | 'autoConnectIdeFlag'
  | 'mainThreadAgentDefinition'
  | 'disableSlashCommands'
  | 'thinkingConfig'
>
export type CliLaunchSessionConfig = Parameters<typeof launchRepl>[2]
export type CliLaunchRenderAndRun = Parameters<typeof launchRepl>[3]

export type CreateCliLaunchContextInput = {
  getFpsMetrics: CliLaunchAppProps['getFpsMetrics']
  stats: CliLaunchAppProps['stats']
  initialState: CliLaunchAppProps['initialState']
  debug: CliLaunchReplProps['debug']
  commands: CliLaunchReplProps['commands']
  autoConnectIdeFlag: CliLaunchReplProps['autoConnectIdeFlag']
  mainThreadAgentDefinition: CliLaunchReplProps['mainThreadAgentDefinition']
  disableSlashCommands: CliLaunchReplProps['disableSlashCommands']
  thinkingConfig: CliLaunchReplProps['thinkingConfig']
}

export type CliLaunchContext = {
  appProps: CliLaunchAppProps
  replProps: CliLaunchReplProps
}

export function createCliLaunchContext(
  input: CreateCliLaunchContextInput,
): CliLaunchContext {
  return {
    appProps: {
      getFpsMetrics: input.getFpsMetrics,
      stats: input.stats,
      initialState: input.initialState,
    },
    replProps: {
      debug: input.debug,
      commands: input.commands,
      autoConnectIdeFlag: input.autoConnectIdeFlag,
      mainThreadAgentDefinition: input.mainThreadAgentDefinition,
      disableSlashCommands: input.disableSlashCommands,
      thinkingConfig: input.thinkingConfig,
    },
  }
}
