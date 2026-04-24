import type { AgentDefinition } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

import { query } from 'src/query.js'
import type { Message } from 'src/types/message.js'
import type { EffortValue } from 'src/utils/effort.js'
import type { ProcessUserInputContext } from 'src/utils/processUserInput/processUserInput.js'
import { fetchSystemPromptParts } from 'src/utils/queryContext.js'
import { buildEffectiveSystemPrompt } from 'src/utils/systemPrompt.js'
import type { SystemPrompt } from 'src/utils/systemPromptType.js'

type QueryArgs = Parameters<typeof query>[0]

type AsyncGeneratorYield<T> = T extends AsyncGenerator<infer TValue, any, any>
  ? TValue
  : never

export type ReplQueryRuntimeEvent = AsyncGeneratorYield<ReturnType<typeof query>>

export type PreparedReplRuntimeQuery = {
  toolUseContext: ProcessUserInputContext
  systemPrompt: SystemPrompt
  userContext: Record<string, string>
  systemContext: Record<string, string>
}

type ReplQueryRuntimeDeps = {
  fetchSystemPromptParts: typeof fetchSystemPromptParts
  buildEffectiveSystemPrompt: typeof buildEffectiveSystemPrompt
  queryFn: typeof query
}

const defaultDeps: ReplQueryRuntimeDeps = {
  fetchSystemPromptParts,
  buildEffectiveSystemPrompt,
  queryFn: query,
}

function withEffortScopedToolUseContext(
  toolUseContext: ProcessUserInputContext,
  effort?: EffortValue,
): ProcessUserInputContext {
  if (effort === undefined) {
    return toolUseContext
  }

  return {
    ...toolUseContext,
    getAppState: () => ({
      ...toolUseContext.getAppState(),
      effortValue: effort,
    }),
  }
}

export async function prepareReplRuntimeQuery({
  toolUseContext,
  mainThreadAgentDefinition,
  extraUserContext,
  effort,
  deps = defaultDeps,
}: {
  toolUseContext: ProcessUserInputContext
  mainThreadAgentDefinition: AgentDefinition | undefined
  extraUserContext?: Record<string, string>
  effort?: EffortValue
  deps?: ReplQueryRuntimeDeps
}): Promise<PreparedReplRuntimeQuery> {
  const preparedToolUseContext = withEffortScopedToolUseContext(
    toolUseContext,
    effort,
  )

  const appState = preparedToolUseContext.getAppState()
  const {
    defaultSystemPrompt,
    userContext: baseUserContext,
    systemContext,
  } = await deps.fetchSystemPromptParts({
    tools: preparedToolUseContext.options.tools,
    mainLoopModel: preparedToolUseContext.options.mainLoopModel,
    additionalWorkingDirectories: Array.from(
      appState.toolPermissionContext.additionalWorkingDirectories.keys(),
    ),
    mcpClients: preparedToolUseContext.options.mcpClients,
    customSystemPrompt: preparedToolUseContext.options.customSystemPrompt,
  })

  const systemPrompt = deps.buildEffectiveSystemPrompt({
    mainThreadAgentDefinition,
    toolUseContext: preparedToolUseContext,
    customSystemPrompt: preparedToolUseContext.options.customSystemPrompt,
    defaultSystemPrompt,
    appendSystemPrompt: preparedToolUseContext.options.appendSystemPrompt,
  })
  preparedToolUseContext.renderedSystemPrompt = systemPrompt

  return {
    toolUseContext: preparedToolUseContext,
    systemPrompt,
    userContext: {
      ...baseUserContext,
      ...(extraUserContext ?? {}),
    },
    systemContext,
  }
}

export async function runReplRuntimeQuery({
  preparedQuery,
  messages,
  canUseTool,
  querySource,
  onQueryEvent,
  ...prepareOptions
}: {
  preparedQuery?: PreparedReplRuntimeQuery
  messages: Message[]
  canUseTool: QueryArgs['canUseTool']
  querySource: QueryArgs['querySource']
  onQueryEvent: (event: ReplQueryRuntimeEvent) => void | Promise<void>
} & Parameters<typeof prepareReplRuntimeQuery>[0]): Promise<PreparedReplRuntimeQuery> {
  const prepared = preparedQuery ?? (await prepareReplRuntimeQuery(prepareOptions))
  const queryFn = prepareOptions.deps?.queryFn ?? defaultDeps.queryFn

  for await (const event of queryFn({
    messages,
    systemPrompt: prepared.systemPrompt,
    userContext: prepared.userContext,
    systemContext: prepared.systemContext,
    canUseTool,
    toolUseContext: prepared.toolUseContext,
    querySource,
  })) {
    await onQueryEvent(event)
  }

  return prepared
}
