export type CliCommandOwnership =
  | 'runtime-capability'
  | 'product-operation'
  | 'host-utility'

export type CliCommandReuse =
  | 'reuse-as-is'
  | 'reuse-with-isolation'
  | 'rewrite-required'

export type CliCommandPath = readonly [string, ...string[]]

export interface CliCommandGraphNode {
  id: string
  path: CliCommandPath
  description: string
  aliases?: readonly string[]
  hidden?: boolean
  ownership: CliCommandOwnership
  reuse: CliCommandReuse
  capability?: string
}

function command(
  id: string,
  path: CliCommandPath,
  description: string,
  options: Omit<CliCommandGraphNode, 'id' | 'path' | 'description'>,
): CliCommandGraphNode {
  return {
    id,
    path,
    description,
    ...options,
  }
}

export const cliCommandGraph = [
  command(
    'mcp',
    ['mcp'],
    'Configure and manage MCP servers',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.serve',
    ['mcp', 'serve'],
    'Start the Claude Code MCP server',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.add',
    ['mcp', 'add'],
    'Add an MCP server to Claude Code.',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.remove',
    ['mcp', 'remove'],
    'Remove an MCP server',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.list',
    ['mcp', 'list'],
    'List configured MCP servers. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.get',
    ['mcp', 'get'],
    'Get details about an MCP server. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.add-json',
    ['mcp', 'add-json'],
    'Add an MCP server (stdio or SSE) with a JSON string',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.add-from-claude-desktop',
    ['mcp', 'add-from-claude-desktop'],
    'Import MCP servers from Claude Desktop (Mac and WSL only)',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'mcp.reset-project-choices',
    ['mcp', 'reset-project-choices'],
    'Reset all approved and rejected project-scoped (.mcp.json) servers within this project',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'mcp',
    },
  ),
  command(
    'server',
    ['server'],
    'Start a Claude Code session server',
    {
      ownership: 'runtime-capability',
      reuse: 'rewrite-required',
      capability: 'server',
    },
  ),
  command(
    'ssh',
    ['ssh'],
    'Run Claude Code on a remote host over SSH. Deploys the binary and tunnels API auth back through your local machine - no remote setup needed.',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'bridge',
    },
  ),
  command(
    'open',
    ['open'],
    'Connect to a Claude Code server (internal - use cc:// URLs)',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'server',
    },
  ),
  command(
    'auth',
    ['auth'],
    'Manage authentication',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'auth',
    },
  ),
  command(
    'auth.login',
    ['auth', 'login'],
    'Sign in to your Anthropic account',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'auth',
    },
  ),
  command(
    'auth.status',
    ['auth', 'status'],
    'Show authentication status',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'auth',
    },
  ),
  command(
    'auth.logout',
    ['auth', 'logout'],
    'Log out from your Anthropic account',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'auth',
    },
  ),
  command(
    'plugin',
    ['plugin'],
    'Manage Claude Code plugins',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
      aliases: ['plugins'],
    },
  ),
  command(
    'plugin.validate',
    ['plugin', 'validate'],
    'Validate a plugin or marketplace manifest',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.list',
    ['plugin', 'list'],
    'List installed plugins',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.marketplace',
    ['plugin', 'marketplace'],
    'Manage Claude Code marketplaces',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.marketplace.add',
    ['plugin', 'marketplace', 'add'],
    'Add a marketplace from a URL, path, or GitHub repo',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.marketplace.list',
    ['plugin', 'marketplace', 'list'],
    'List all configured marketplaces',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.marketplace.remove',
    ['plugin', 'marketplace', 'remove'],
    'Remove a configured marketplace',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.marketplace.update',
    ['plugin', 'marketplace', 'update'],
    'Update marketplace(s) from their source - updates all if no name specified',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.install',
    ['plugin', 'install'],
    'Install a plugin from available marketplaces (use plugin@marketplace for specific marketplace)',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.uninstall',
    ['plugin', 'uninstall'],
    'Uninstall an installed plugin',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.enable',
    ['plugin', 'enable'],
    'Enable a disabled plugin',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.disable',
    ['plugin', 'disable'],
    'Disable an enabled plugin',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'plugin.update',
    ['plugin', 'update'],
    'Update a plugin to the latest version (restart required to apply)',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'plugins',
    },
  ),
  command(
    'setup-token',
    ['setup-token'],
    'Set up a long-lived authentication token (requires Claude subscription)',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'auth',
    },
  ),
  command(
    'agents',
    ['agents'],
    'List configured agents',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'agents',
    },
  ),
  command(
    'auto-mode',
    ['auto-mode'],
    'Inspect auto mode classifier configuration',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'policy',
    },
  ),
  command(
    'auto-mode.defaults',
    ['auto-mode', 'defaults'],
    'Print the default auto mode environment, allow, and deny rules as JSON',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'policy',
    },
  ),
  command(
    'auto-mode.config',
    ['auto-mode', 'config'],
    'Print the effective auto mode config as JSON: your settings where set, defaults otherwise',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'policy',
    },
  ),
  command(
    'auto-mode.critique',
    ['auto-mode', 'critique'],
    'Get AI feedback on your custom auto mode rules',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'policy',
    },
  ),
  command(
    'autonomy',
    ['autonomy'],
    'Inspect and manage automatic autonomy runs and flows',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.status',
    ['autonomy', 'status'],
    'Print autonomy run, flow, team, pipe, and remote-control status',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.runs',
    ['autonomy', 'runs'],
    'List recent autonomy runs',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.flows',
    ['autonomy', 'flows'],
    'List recent autonomy flows',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.flow',
    ['autonomy', 'flow'],
    'Inspect or manage a single autonomy flow',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.flow.cancel',
    ['autonomy', 'flow', 'cancel'],
    'Cancel a queued, waiting, or running autonomy flow',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'autonomy.flow.resume',
    ['autonomy', 'flow', 'resume'],
    'Resume a waiting autonomy flow and print the prepared prompt',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'remote-control',
    ['remote-control'],
    'Connect your local environment for remote-control sessions via claude.ai/code',
    {
      ownership: 'runtime-capability',
      reuse: 'reuse-with-isolation',
      capability: 'bridge',
      aliases: ['rc'],
      hidden: true,
    },
  ),
  command(
    'assistant',
    ['assistant'],
    'Attach the REPL as a client to a running bridge session. Discovers sessions via API if no sessionId given.',
    {
      ownership: 'runtime-capability',
      reuse: 'rewrite-required',
      capability: 'bridge',
    },
  ),
  command(
    'doctor',
    ['doctor'],
    'Check the health of your Claude Code auto-updater. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'support',
    },
  ),
  command(
    'up',
    ['up'],
    '[ANT-ONLY] Initialize or upgrade the local dev environment using the "# claude up" section of the nearest CLAUDE.md',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'support',
    },
  ),
  command(
    'rollback',
    ['rollback'],
    '[ANT-ONLY] Roll back to a previous release\n\nExamples:\n  claude rollback                                    Go 1 version back from current\n  claude rollback 3                                  Go 3 versions back from current\n  claude rollback 2.0.73-dev.20251217.t190658        Roll back to a specific version',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'updates',
    },
  ),
  command(
    'install',
    ['install'],
    'Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'updates',
    },
  ),
  command(
    'update',
    ['update'],
    'Update hare to the latest version',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'updates',
    },
  ),
  command(
    'log',
    ['log'],
    '[ANT-ONLY] Manage conversation logs.',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'support',
    },
  ),
  command(
    'error',
    ['error'],
    '[ANT-ONLY] View error logs. Optionally provide a number (0, -1, -2, etc.) to display a specific log.',
    {
      ownership: 'product-operation',
      reuse: 'reuse-as-is',
      capability: 'support',
    },
  ),
  command(
    'export',
    ['export'],
    '[ANT-ONLY] Export a conversation to a text file.',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'support',
    },
  ),
  command(
    'task',
    ['task'],
    '[ANT-ONLY] Manage task list tasks',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'task.create',
    ['task', 'create'],
    'Create a new task',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'task.list',
    ['task', 'list'],
    'List all tasks',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'task.get',
    ['task', 'get'],
    'Get details of a task',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'task.update',
    ['task', 'update'],
    'Update a task',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'task.dir',
    ['task', 'dir'],
    'Show the tasks directory path',
    {
      ownership: 'product-operation',
      reuse: 'reuse-with-isolation',
      capability: 'workflow',
    },
  ),
  command(
    'completion',
    ['completion'],
    'Generate shell completion script (bash, zsh, or fish)',
    {
      ownership: 'host-utility',
      reuse: 'reuse-as-is',
      capability: 'cli',
      hidden: true,
    },
  ),
] satisfies CliCommandGraphNode[]

const cliCommandGraphIndex = new Map(
  cliCommandGraph.map(node => [node.path.join(' '), node]),
)

export function listCliCommandGraph(): readonly CliCommandGraphNode[] {
  return cliCommandGraph
}

export function getCliCommandGraphNode(path: CliCommandPath): CliCommandGraphNode {
  const node = cliCommandGraphIndex.get(path.join(' '))
  if (!node) {
    throw new Error(`CLI command graph node not found for path: ${path.join(' ')}`)
  }
  return node
}

export function listCliCommandsByOwnership(
  ownership: CliCommandOwnership,
): CliCommandGraphNode[] {
  return cliCommandGraph.filter(node => node.ownership === ownership)
}

export function listRuntimeOwnedCliCommands(): CliCommandGraphNode[] {
  return listCliCommandsByOwnership('runtime-capability')
}

export function listProductOperationCliCommands(): CliCommandGraphNode[] {
  return listCliCommandsByOwnership('product-operation')
}
