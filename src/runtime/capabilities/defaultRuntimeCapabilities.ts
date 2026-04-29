import {
  RuntimeCapabilityResolver,
  type RuntimeCapabilityDefinition,
  type RuntimeCapabilityLoadContext,
} from './RuntimeCapabilityResolver.js'

function capability(
  name: string,
  options: Omit<RuntimeCapabilityDefinition, 'name'> = {},
): RuntimeCapabilityDefinition {
  return {
    name,
    ...options,
  }
}

export function createDefaultRuntimeCapabilityDefinitions(): readonly RuntimeCapabilityDefinition[] {
  return [
    capability('runtime', { lazy: false, reloadable: false }),
    capability('events', { lazy: false, reloadable: false }),
    capability('conversation', {
      lazy: false,
      reloadable: false,
      dependencies: ['runtime', 'events'],
    }),
    capability('turn', {
      lazy: false,
      reloadable: false,
      dependencies: ['conversation', 'events'],
    }),
    capability('permissions', {
      lazy: false,
      dependencies: ['events'],
    }),
    capability('provider', { dependencies: ['runtime'] }),
    capability('auth', { dependencies: ['provider'] }),
    capability('plugins', {
      dependencies: ['runtime'],
      load: async () => import('./plugins/RuntimePluginService.js'),
    }),
    capability('skills', {
      dependencies: ['plugins'],
      load: async () => import('../../skills/loadSkillsDir.js'),
    }),
    capability('mcp', {
      dependencies: ['permissions'],
      load: async () => import('./mcp/McpRegistry.js'),
    }),
    capability('commands', {
      dependencies: ['skills', 'plugins', 'mcp'],
      load: async context => {
        await prepareDefaultRuntimeCapabilityLoad()
        const commands = await import('../../commands.js')
        return commands.getRuntimeCommandGraph(context.cwd ?? process.cwd())
      },
    }),
    capability('tools', {
      dependencies: ['permissions', 'mcp'],
      load: async () => import('./tools/ToolPolicy.js'),
    }),
    capability('hooks', {
      dependencies: ['plugins', 'tools'],
      load: async () => import('./hooks/RuntimeHookService.js'),
    }),
    capability('agents', { dependencies: ['tools', 'permissions'] }),
    capability('tasks', { dependencies: ['agents', 'sessions'] }),
    capability('teams', { dependencies: ['agents', 'tasks', 'sessions'] }),
    capability('coordinator', { dependencies: ['teams', 'agents', 'tasks'] }),
    capability('context', { dependencies: ['runtime', 'events'] }),
    capability('memory', { dependencies: ['runtime', 'events'] }),
    capability('sessions', { dependencies: ['runtime', 'events'] }),
    capability('execution', {
      dependencies: ['conversation', 'turn', 'tools', 'permissions'],
      load: async () => import('./execution/headlessCapabilityMaterializer.js'),
    }),
    capability('server', { dependencies: ['sessions', 'execution'] }),
    capability('bridge', { dependencies: ['server', 'events'] }),
    capability('daemon', { dependencies: ['server', 'sessions'] }),
    capability('companion', { dependencies: ['events', 'provider'] }),
    capability('kairos', {
      dependencies: ['events', 'memory', 'provider'],
      enabled: () =>
        process.env.FEATURE_KAIROS === '1' ||
        process.env.FEATURE_PROACTIVE === '1',
      metadata: { optional: true },
    }),
    capability('background', { dependencies: ['daemon', 'sessions'] }),
    capability('logs', { dependencies: ['sessions'] }),
  ]
}

export function createDefaultRuntimeCapabilityResolver(
  context?: RuntimeCapabilityLoadContext,
): RuntimeCapabilityResolver {
  return new RuntimeCapabilityResolver(
    createDefaultRuntimeCapabilityDefinitions(),
    context,
  )
}

async function prepareDefaultRuntimeCapabilityLoad(): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    return
  }
  const { enableConfigs } = await import('../../utils/config.js')
  enableConfigs()
}
