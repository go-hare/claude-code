import { feature } from 'bun:bundle'
import {
  Command as CommanderCommand,
  Option,
} from '@commander-js/extra-typings'
import {
  getOriginalCwd,
  setCwdState,
  setDirectConnectServerUrl,
  setOriginalCwd,
} from '../../bootstrap/state.js'
import { registerMcpAddCommand } from '../../commands/mcp/addCommand.js'
import { registerMcpXaaIdpCommand } from '../../commands/mcp/xaaIdpCommand.js'
import {
  createDirectConnectSession,
  DirectConnectError,
} from '../../server/createDirectConnectSession.js'
import {
  VALID_INSTALLABLE_SCOPES,
  VALID_UPDATE_SCOPES,
} from '../../services/plugins/pluginCliCommands.js'
import { isXaaEnabled } from '../../services/mcp/xaaIdpLogin.js'
import { getBaseRenderOptions } from '../../utils/renderOptions.js'
import { getAutoModeEnabledStateIfCached } from '../../utils/permissions/permissionSetup.js'
import { TASK_STATUSES } from '../../utils/tasks.js'
import { validateUuid } from '../../utils/uuid.js'
import {
  getCliCommandGraphNode,
  type CliCommandPath,
} from '../../runtime/capabilities/commands/cliCommandGraph.js'

type SortedHelpConfig = {
  sortSubcommands: true
  sortOptions: true
}

export interface CliHostRegistrationOptions {
  createSortedHelpConfig: () => SortedHelpConfig
  getPendingConnectDangerouslySkipPermissions: () => boolean | undefined
}

function describe(path: CliCommandPath): string {
  return getCliCommandGraphNode(path).description
}

function aliases(path: CliCommandPath): readonly string[] {
  return getCliCommandGraphNode(path).aliases ?? []
}

function isHidden(path: CliCommandPath): boolean {
  return getCliCommandGraphNode(path).hidden ?? false
}

function applyAliases(
  command: CommanderCommand,
  path: CliCommandPath,
): CommanderCommand {
  for (const alias of aliases(path)) {
    command.alias(alias)
  }
  return command
}

export function registerCliHostCommands(
  program: CommanderCommand,
  options: CliHostRegistrationOptions,
): void {
  const mcp = program
    .command('mcp')
    .description(describe(['mcp']))
    .configureHelp(options.createSortedHelpConfig())
    .enablePositionalOptions()

  mcp.command('serve')
    .description(describe(['mcp', 'serve']))
    .option('-d, --debug', 'Enable debug mode', () => true)
    .option('--verbose', 'Override verbose mode setting from config', () => true)
    .action(async ({ debug, verbose }: { debug?: boolean; verbose?: boolean }) => {
      const { mcpServeHandler } = await import('../../cli/handlers/mcp.js')
      await mcpServeHandler({ debug, verbose })
    })

  registerMcpAddCommand(mcp)

  if (isXaaEnabled()) {
    registerMcpXaaIdpCommand(mcp)
  }

  mcp.command('remove <name>')
    .description(describe(['mcp', 'remove']))
    .option(
      '-s, --scope <scope>',
      'Configuration scope (local, user, or project) - if not specified, removes from whichever scope it exists in',
    )
    .action(async (name: string, commandOptions: { scope?: string }) => {
      const { mcpRemoveHandler } = await import('../../cli/handlers/mcp.js')
      await mcpRemoveHandler(name, commandOptions)
    })

  mcp.command('list')
    .description(describe(['mcp', 'list']))
    .action(async () => {
      const { mcpListHandler } = await import('../../cli/handlers/mcp.js')
      await mcpListHandler()
    })

  mcp.command('get <name>')
    .description(describe(['mcp', 'get']))
    .action(async (name: string) => {
      const { mcpGetHandler } = await import('../../cli/handlers/mcp.js')
      await mcpGetHandler(name)
    })

  mcp.command('add-json <name> <json>')
    .description(describe(['mcp', 'add-json']))
    .option('-s, --scope <scope>', 'Configuration scope (local, user, or project)', 'local')
    .option(
      '--client-secret',
      'Prompt for OAuth client secret (or set MCP_CLIENT_SECRET env var)',
    )
    .action(
      async (
        name: string,
        json: string,
        commandOptions: { scope?: string; clientSecret?: true },
      ) => {
        const { mcpAddJsonHandler } = await import('../../cli/handlers/mcp.js')
        await mcpAddJsonHandler(name, json, commandOptions)
      },
    )

  mcp.command('add-from-claude-desktop')
    .description(describe(['mcp', 'add-from-claude-desktop']))
    .option('-s, --scope <scope>', 'Configuration scope (local, user, or project)', 'local')
    .action(async (commandOptions: { scope?: string }) => {
      const { mcpAddFromDesktopHandler } = await import(
        '../../cli/handlers/mcp.js'
      )
      await mcpAddFromDesktopHandler(commandOptions)
    })

  mcp.command('reset-project-choices')
    .description(describe(['mcp', 'reset-project-choices']))
    .action(async () => {
      const { mcpResetChoicesHandler } = await import('../../cli/handlers/mcp.js')
      await mcpResetChoicesHandler()
    })

  if (feature('DIRECT_CONNECT')) {
    program
      .command('server')
      .description(describe(['server']))
      .option('--port <number>', 'HTTP port', '0')
      .option('--host <string>', 'Bind address', '0.0.0.0')
      .option('--auth-token <token>', 'Bearer token for auth')
      .option('--unix <path>', 'Listen on a unix domain socket')
      .option(
        '--workspace <dir>',
        'Default working directory for sessions that do not specify cwd',
      )
      .option(
        '--idle-timeout <ms>',
        'Idle timeout for detached sessions in ms (0 = never expire)',
        '600000',
      )
      .option(
        '--max-sessions <n>',
        'Maximum concurrent sessions (0 = unlimited)',
        '32',
      )
      .action(
        async (opts: {
          port: string
          host: string
          authToken?: string
          unix?: string
          workspace?: string
          idleTimeout: string
          maxSessions: string
        }) => {
          const { randomBytes } = await import('crypto')
          const { startServer } = await import('../../server/server.js')
          const { SessionManager } = await import('../../server/sessionManager.js')
          const { DangerousBackend } = await import(
            '../../server/backends/dangerousBackend.js'
          )
          const { printBanner } = await import('../../server/serverBanner.js')
          const { createServerLogger } = await import('../../server/serverLog.js')
          const {
            writeServerLock,
            removeServerLock,
            probeRunningServer,
          } = await import('../../server/lockfile.js')

          const existing = await probeRunningServer()
          if (existing) {
            process.stderr.write(
              `A claude server is already running (pid ${existing.pid}) at ${existing.httpUrl}\n`,
            )
            process.exit(1)
          }

          const authToken =
            opts.authToken ??
            `sk-ant-cc-${randomBytes(16).toString('base64url')}`

          const config = {
            port: parseInt(opts.port, 10),
            host: opts.host,
            authToken,
            unix: opts.unix,
            workspace: opts.workspace,
            idleTimeoutMs: parseInt(opts.idleTimeout, 10),
            maxSessions: parseInt(opts.maxSessions, 10),
          }

          const backend = new DangerousBackend()
          const sessionManager = new SessionManager(backend, {
            idleTimeoutMs: config.idleTimeoutMs,
            maxSessions: config.maxSessions,
          })
          const logger = createServerLogger()

          const server = startServer(config, sessionManager, logger)
          const actualPort = server.port ?? config.port
          printBanner(config, authToken, actualPort)

          await writeServerLock({
            pid: process.pid,
            port: actualPort,
            host: config.host,
            httpUrl: config.unix
              ? `unix:${config.unix}`
              : `http://${config.host}:${actualPort}`,
            startedAt: Date.now(),
          })

          let shuttingDown = false
          const shutdown = async () => {
            if (shuttingDown) return
            shuttingDown = true
            server.stop(true)
            await sessionManager.destroyAll()
            await removeServerLock()
            process.exit(0)
          }
          process.once('SIGINT', () => void shutdown())
          process.once('SIGTERM', () => void shutdown())
        },
      )
  }

  if (feature('SSH_REMOTE')) {
    program
      .command('ssh <host> [dir]')
      .description(describe(['ssh']))
      .option('--permission-mode <mode>', 'Permission mode for the remote session')
      .option(
        '--dangerously-skip-permissions',
        'Skip all permission prompts on the remote (dangerous)',
      )
      .option(
        '--remote-bin <command>',
        "Custom remote binary command (skips probe/deploy). Example: --remote-bin 'bun /path/to/project/dist/cli.js'",
      )
      .option(
        '--local',
        'e2e test mode - spawn the child CLI locally (skip ssh/deploy). Exercises the auth proxy and unix-socket plumbing without a remote host.',
      )
      .action(async () => {
        process.stderr.write(
          'Usage: claude ssh <user@host | ssh-config-alias> [dir]\n\n' +
            'Runs Claude Code on a remote Linux host. You do not need to install\n' +
            'anything on the remote or run `claude auth login` there - the binary is\n' +
            'deployed over SSH and API auth tunnels back through your local machine.\n',
        )
        process.exit(1)
      })
  }

  if (feature('DIRECT_CONNECT')) {
    program
      .command('open <cc-url>')
      .description(describe(['open']))
      .option('-p, --print [prompt]', 'Print mode (headless)')
      .option('--output-format <format>', 'Output format: text, json, stream-json', 'text')
      .action(
        async (
          ccUrl: string,
          commandOptions: {
            print?: string | true
            outputFormat?: string
          },
        ) => {
          const { parseConnectUrl } = await import('../../server/parseConnectUrl.js')
          const { serverUrl, authToken } = parseConnectUrl(ccUrl)

          let connectConfig
          try {
            const session = await createDirectConnectSession({
              serverUrl,
              authToken,
              cwd: getOriginalCwd(),
              dangerouslySkipPermissions:
                options.getPendingConnectDangerouslySkipPermissions(),
            })
            if (session.workDir) {
              setOriginalCwd(session.workDir)
              setCwdState(session.workDir)
            }
            setDirectConnectServerUrl(serverUrl)
            connectConfig = session.config
          } catch (error) {
            // biome-ignore lint/suspicious/noConsole: intentional error output
            console.error(
              error instanceof DirectConnectError ? error.message : String(error),
            )
            process.exit(1)
          }

          const { runConnectHeadless } = await import(
            '../../server/connectHeadless.js'
          )

          const prompt =
            typeof commandOptions.print === 'string' ? commandOptions.print : ''
          const interactive = commandOptions.print === true
          await runConnectHeadless(
            connectConfig,
            prompt,
            commandOptions.outputFormat,
            interactive,
          )
        },
      )
  }

  const auth = program
    .command('auth')
    .description(describe(['auth']))
    .configureHelp(options.createSortedHelpConfig())

  auth.command('login')
    .description(describe(['auth', 'login']))
    .option('--email <email>', 'Pre-populate email address on the login page')
    .option('--sso', 'Force SSO login flow')
    .option(
      '--console',
      'Use Anthropic Console (API usage billing) instead of Claude subscription',
    )
    .option('--claudeai', 'Use Claude subscription (default)')
    .action(
      async ({
        email,
        sso,
        console: useConsole,
        claudeai,
      }: {
        email?: string
        sso?: boolean
        console?: boolean
        claudeai?: boolean
      }) => {
        const { authLogin } = await import('../../cli/handlers/auth.js')
        await authLogin({ email, sso, console: useConsole, claudeai })
      },
    )

  auth.command('status')
    .description(describe(['auth', 'status']))
    .option('--json', 'Output as JSON (default)')
    .option('--text', 'Output as human-readable text')
    .action(async (commandOptions: { json?: boolean; text?: boolean }) => {
      const { authStatus } = await import('../../cli/handlers/auth.js')
      await authStatus(commandOptions)
    })

  auth.command('logout')
    .description(describe(['auth', 'logout']))
    .action(async () => {
      const { authLogout } = await import('../../cli/handlers/auth.js')
      await authLogout()
    })

  const coworkOption = () =>
    new Option('--cowork', 'Use cowork_plugins directory').hideHelp()

  const pluginSpec = getCliCommandGraphNode(['plugin'])
  const pluginCmd = applyAliases(
    program
      .command('plugin')
      .description(pluginSpec.description)
      .configureHelp(options.createSortedHelpConfig()),
    ['plugin'],
  )

  pluginCmd
    .command('validate <path>')
    .description(describe(['plugin', 'validate']))
    .addOption(coworkOption())
    .action(async (manifestPath: string, commandOptions: { cowork?: boolean }) => {
      const { pluginValidateHandler } = await import('../../cli/handlers/plugins.js')
      await pluginValidateHandler(manifestPath, commandOptions)
    })

  pluginCmd
    .command('list')
    .description(describe(['plugin', 'list']))
    .option('--json', 'Output as JSON')
    .option(
      '--available',
      'Include available plugins from marketplaces (requires --json)',
    )
    .addOption(coworkOption())
    .action(
      async (commandOptions: {
        json?: boolean
        available?: boolean
        cowork?: boolean
      }) => {
        const { pluginListHandler } = await import('../../cli/handlers/plugins.js')
        await pluginListHandler(commandOptions)
      },
    )

  const marketplaceCmd = pluginCmd
    .command('marketplace')
    .description(describe(['plugin', 'marketplace']))
    .configureHelp(options.createSortedHelpConfig())

  marketplaceCmd
    .command('add <source>')
    .description(describe(['plugin', 'marketplace', 'add']))
    .addOption(coworkOption())
    .option(
      '--sparse <paths...>',
      'Limit checkout to specific directories via git sparse-checkout (for monorepos). Example: --sparse .claude-plugin plugins',
    )
    .option(
      '--scope <scope>',
      'Where to declare the marketplace: user (default), project, or local',
    )
    .action(
      async (
        source: string,
        commandOptions: {
          cowork?: boolean
          sparse?: string[]
          scope?: string
        },
      ) => {
        const { marketplaceAddHandler } = await import(
          '../../cli/handlers/plugins.js'
        )
        await marketplaceAddHandler(source, commandOptions)
      },
    )

  marketplaceCmd
    .command('list')
    .description(describe(['plugin', 'marketplace', 'list']))
    .option('--json', 'Output as JSON')
    .addOption(coworkOption())
    .action(async (commandOptions: { json?: boolean; cowork?: boolean }) => {
      const { marketplaceListHandler } = await import(
        '../../cli/handlers/plugins.js'
      )
      await marketplaceListHandler(commandOptions)
    })

  marketplaceCmd
    .command('remove <name>')
    .alias('rm')
    .description(describe(['plugin', 'marketplace', 'remove']))
    .addOption(coworkOption())
    .action(async (name: string, commandOptions: { cowork?: boolean }) => {
      const { marketplaceRemoveHandler } = await import(
        '../../cli/handlers/plugins.js'
      )
      await marketplaceRemoveHandler(name, commandOptions)
    })

  marketplaceCmd
    .command('update [name]')
    .description(describe(['plugin', 'marketplace', 'update']))
    .addOption(coworkOption())
    .action(async (name: string | undefined, commandOptions: { cowork?: boolean }) => {
      const { marketplaceUpdateHandler } = await import(
        '../../cli/handlers/plugins.js'
      )
      await marketplaceUpdateHandler(name, commandOptions)
    })

  pluginCmd
    .command('install <plugin>')
    .alias('i')
    .description(describe(['plugin', 'install']))
    .option('-s, --scope <scope>', 'Installation scope: user, project, or local', 'user')
    .addOption(coworkOption())
    .action(
      async (
        plugin: string,
        commandOptions: { scope?: string; cowork?: boolean },
      ) => {
        const { pluginInstallHandler } = await import('../../cli/handlers/plugins.js')
        await pluginInstallHandler(plugin, commandOptions)
      },
    )

  pluginCmd
    .command('uninstall <plugin>')
    .alias('remove')
    .alias('rm')
    .description(describe(['plugin', 'uninstall']))
    .option('-s, --scope <scope>', 'Uninstall from scope: user, project, or local', 'user')
    .option(
      '--keep-data',
      'Preserve the plugin persistent data directory (~/.claude/plugins/data/{id}/)',
    )
    .addOption(coworkOption())
    .action(
      async (
        plugin: string,
        commandOptions: {
          scope?: string
          cowork?: boolean
          keepData?: boolean
        },
      ) => {
        const { pluginUninstallHandler } = await import(
          '../../cli/handlers/plugins.js'
        )
        await pluginUninstallHandler(plugin, commandOptions)
      },
    )

  pluginCmd
    .command('enable <plugin>')
    .description(describe(['plugin', 'enable']))
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${VALID_INSTALLABLE_SCOPES.join(', ')} (default: auto-detect)`,
    )
    .addOption(coworkOption())
    .action(
      async (
        plugin: string,
        commandOptions: { scope?: string; cowork?: boolean },
      ) => {
        const { pluginEnableHandler } = await import('../../cli/handlers/plugins.js')
        await pluginEnableHandler(plugin, commandOptions)
      },
    )

  pluginCmd
    .command('disable [plugin]')
    .description(describe(['plugin', 'disable']))
    .option('-a, --all', 'Disable all enabled plugins')
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${VALID_INSTALLABLE_SCOPES.join(', ')} (default: auto-detect)`,
    )
    .addOption(coworkOption())
    .action(
      async (
        plugin: string | undefined,
        commandOptions: { scope?: string; cowork?: boolean; all?: boolean },
      ) => {
        const { pluginDisableHandler } = await import('../../cli/handlers/plugins.js')
        await pluginDisableHandler(plugin, commandOptions)
      },
    )

  pluginCmd
    .command('update <plugin>')
    .description(describe(['plugin', 'update']))
    .option(
      '-s, --scope <scope>',
      `Installation scope: ${VALID_UPDATE_SCOPES.join(', ')} (default: user)`,
    )
    .addOption(coworkOption())
    .action(
      async (
        plugin: string,
        commandOptions: { scope?: string; cowork?: boolean },
      ) => {
        const { pluginUpdateHandler } = await import('../../cli/handlers/plugins.js')
        await pluginUpdateHandler(plugin, commandOptions)
      },
    )

  program
    .command('setup-token')
    .description(describe(['setup-token']))
    .action(async () => {
      const [{ setupTokenHandler }, { createRoot }] = await Promise.all([
        import('../../cli/handlers/util.js'),
        import('@anthropic/ink'),
      ])
      const root = await createRoot(getBaseRenderOptions(false))
      await setupTokenHandler(root)
    })

  program
    .command('agents')
    .description(describe(['agents']))
    .option(
      '--setting-sources <sources>',
      'Comma-separated list of setting sources to load (user, project, local).',
    )
    .action(async () => {
      const { agentsHandler } = await import('../../cli/handlers/agents.js')
      await agentsHandler()
      process.exit(0)
    })

  if (feature('TRANSCRIPT_CLASSIFIER')) {
    if (getAutoModeEnabledStateIfCached() !== 'disabled') {
      const autoModeCmd = program
        .command('auto-mode')
        .description(describe(['auto-mode']))

      autoModeCmd
        .command('defaults')
        .description(describe(['auto-mode', 'defaults']))
        .action(async () => {
          const { autoModeDefaultsHandler } = await import(
            '../../cli/handlers/autoMode.js'
          )
          autoModeDefaultsHandler()
          process.exit(0)
        })

      autoModeCmd
        .command('config')
        .description(describe(['auto-mode', 'config']))
        .action(async () => {
          const { autoModeConfigHandler } = await import(
            '../../cli/handlers/autoMode.js'
          )
          autoModeConfigHandler()
          process.exit(0)
        })

      autoModeCmd
        .command('critique')
        .description(describe(['auto-mode', 'critique']))
        .option('--model <model>', 'Override which model is used')
        .action(async (commandOptions: { model?: string }) => {
          const { autoModeCritiqueHandler } = await import(
            '../../cli/handlers/autoMode.js'
          )
          await autoModeCritiqueHandler(commandOptions)
          process.exit()
        })
    }
  }

  if (feature('BRIDGE_MODE')) {
    applyAliases(
      program
        .command('remote-control', { hidden: isHidden(['remote-control']) })
        .description(describe(['remote-control']))
        .action(async () => {
          const { bridgeMain } = await import('../../bridge/bridgeMain.js')
          await bridgeMain(process.argv.slice(3))
        }),
      ['remote-control'],
    )
  }

  if (feature('KAIROS')) {
    program
      .command('assistant [sessionId]')
      .description(describe(['assistant']))
      .action(() => {
        process.stderr.write(
          'Usage: claude assistant [sessionId]\n\n' +
            'Attach the REPL as a viewer client to a running bridge session.\n' +
            'Omit sessionId to discover and pick from available sessions.\n',
        )
        process.exit(1)
      })
  }

  program
    .command('doctor')
    .description(describe(['doctor']))
    .action(async () => {
      const [{ doctorHandler }, { createRoot }] = await Promise.all([
        import('../../cli/handlers/util.js'),
        import('@anthropic/ink'),
      ])
      const root = await createRoot(getBaseRenderOptions(false))
      await doctorHandler(root)
    })

  if (process.env.USER_TYPE === 'ant') {
    program
      .command('up')
      .description(describe(['up']))
      .action(async () => {
        const { up } = await import('../../cli/up.js')
        await up()
      })
  }

  if (process.env.USER_TYPE === 'ant') {
    program
      .command('rollback [target]')
      .description(describe(['rollback']))
      .option('-l, --list', 'List recent published versions with ages')
      .option('--dry-run', 'Show what would be installed without installing')
      .option(
        '--safe',
        'Roll back to the server-pinned safe version (set by oncall during incidents)',
      )
      .action(
        async (
          target?: string,
          commandOptions?: {
            list?: boolean
            dryRun?: boolean
            safe?: boolean
          },
        ) => {
          const { rollback } = await import('../../cli/rollback.js')
          await rollback(target, commandOptions)
        },
      )
  }

  program
    .command('install [target]')
    .description(describe(['install']))
    .option('--force', 'Force installation even if already installed')
    .action(async (target: string | undefined, commandOptions: { force?: boolean }) => {
      const { installHandler } = await import('../../cli/handlers/util.js')
      await installHandler(target, commandOptions)
    })

  program
    .command('update')
    .description(describe(['update']))
    .action(async () => {
        const { updateHare } = await import('../../cli/updateHare.js')
        await updateHare()
    })

  if (process.env.USER_TYPE === 'ant') {
    const validateLogId = (value: string) => {
      const maybeSessionId = validateUuid(value)
      if (maybeSessionId) return maybeSessionId
      return Number(value)
    }

    program
      .command('log')
      .description(describe(['log']))
      .argument(
        '[number|sessionId]',
        'A number (0, 1, 2, etc.) to display a specific log, or the sesssion ID (uuid) of a log',
        validateLogId,
      )
      .action(async (logId: string | number | undefined) => {
        const { logHandler } = await import('../../cli/handlers/ant.js')
        await logHandler(logId)
      })

    program
      .command('error')
      .description(describe(['error']))
      .argument(
        '[number]',
        'A number (0, 1, 2, etc.) to display a specific log',
        parseInt,
      )
      .action(async (number: number | undefined) => {
        const { errorHandler } = await import('../../cli/handlers/ant.js')
        await errorHandler(number)
      })

    program
      .command('export')
      .description(describe(['export']))
      .usage('<source> <outputFile>')
      .argument(
        '<source>',
        'Session ID, log index (0, 1, 2...), or path to a .json/.jsonl log file',
      )
      .argument('<outputFile>', 'Output file path for the exported text')
      .addHelpText(
        'after',
        `
Examples:
  $ claude export 0 conversation.txt                Export conversation at log index 0
  $ claude export <uuid> conversation.txt           Export conversation by session ID
  $ claude export input.json output.txt             Render JSON log file to text
  $ claude export <uuid>.jsonl output.txt           Render JSONL session file to text`,
      )
      .action(async (source: string, outputFile: string) => {
        const { exportHandler } = await import('../../cli/handlers/ant.js')
        await exportHandler(source, outputFile)
      })

    const taskCmd = program
      .command('task')
      .description(describe(['task']))

    taskCmd
      .command('create <subject>')
      .description(describe(['task', 'create']))
      .option('-d, --description <text>', 'Task description')
      .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
      .action(
        async (
          subject: string,
          commandOptions: { description?: string; list?: string },
        ) => {
          const { taskCreateHandler } = await import('../../cli/handlers/ant.js')
          await taskCreateHandler(subject, commandOptions)
        },
      )

    taskCmd
      .command('list')
      .description(describe(['task', 'list']))
      .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
      .option('--pending', 'Show only pending tasks')
      .option('--json', 'Output as JSON')
      .action(
        async (commandOptions: { list?: string; pending?: boolean; json?: boolean }) => {
          const { taskListHandler } = await import('../../cli/handlers/ant.js')
          await taskListHandler(commandOptions)
        },
      )

    taskCmd
      .command('get <id>')
      .description(describe(['task', 'get']))
      .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
      .action(async (id: string, commandOptions: { list?: string }) => {
        const { taskGetHandler } = await import('../../cli/handlers/ant.js')
        await taskGetHandler(id, commandOptions)
      })

    taskCmd
      .command('update <id>')
      .description(describe(['task', 'update']))
      .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
      .option('-s, --status <status>', `Set status (${TASK_STATUSES.join(', ')})`)
      .option('--subject <text>', 'Update subject')
      .option('-d, --description <text>', 'Update description')
      .option('--owner <agentId>', 'Set owner')
      .option('--clear-owner', 'Clear owner')
      .action(
        async (
          id: string,
          commandOptions: {
            list?: string
            status?: string
            subject?: string
            description?: string
            owner?: string
            clearOwner?: boolean
          },
        ) => {
          const { taskUpdateHandler } = await import('../../cli/handlers/ant.js')
          await taskUpdateHandler(id, commandOptions)
        },
      )

    taskCmd
      .command('dir')
      .description(describe(['task', 'dir']))
      .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
      .action(async (commandOptions: { list?: string }) => {
        const { taskDirHandler } = await import('../../cli/handlers/ant.js')
        await taskDirHandler(commandOptions)
      })

    program
      .command('completion <shell>', { hidden: isHidden(['completion']) })
      .description(describe(['completion']))
      .option(
        '--output <file>',
        'Write completion script directly to a file instead of stdout',
      )
      .action(async (shell: string, commandOptions: { output?: string }) => {
        const { completionHandler } = await import('../../cli/handlers/ant.js')
        await completionHandler(shell, commandOptions, program)
      })
  }
}
