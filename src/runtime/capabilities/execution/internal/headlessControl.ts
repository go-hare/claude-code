import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import type { AppState } from 'src/state/AppStateStore.js'
import type { Command } from 'src/commands.js'
import { formatDescriptionWithSource, getCommandName } from 'src/commands.js'
import type {
  HookEvent,
  ModelInfo,
  ProtocolStatus,
} from 'src/types/protocol/index.js'
import type { ProtocolUserMessage } from 'src/types/protocol/index.js'
import type {
  ProtocolControlInitializeRequest,
  ProtocolControlInitializeResponse,
  ProtocolStdoutMessage,
} from 'src/types/protocol/controlTypes.js'
import {
  StructuredIO,
  createStructuredPermissionRequest,
  decidePermissionSafely,
  kernelDecisionFromPermissionToolOutput,
  permissionDecisionFromKernelDecision,
  recordResolvedPermissionDecision,
  type StructuredIOPermissionOptions,
} from './io/structuredIO.js'
import { RemoteIO } from './io/remoteIO.js'
import type { Tool } from 'src/Tool.js'
import { toolMatchesName } from 'src/Tool.js'
import type { QueuedCommand } from 'src/types/textInputTypes.js'
import type { PermissionPromptTool } from 'src/utils/queryHelpers.js'
import {
  outputSchema as permissionToolOutputSchema,
  permissionPromptToolResultToPermissionDecision,
} from 'src/utils/permissions/PermissionPromptToolResultSchema.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { createToolPermissionRuntimeContext } from 'src/utils/permissions/runtimePermissionBroker.js'
import { safeParseJSON } from 'src/utils/json.js'
import { fromArray } from 'src/utils/generators.js'
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js'
import { jsonStringify } from '../../../../utils/slowOperations.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import type { RequiresActionDetails } from 'src/utils/sessionState.js'
import { createChildAbortController } from 'src/utils/abortController.js'
import { createCombinedAbortSignal } from 'src/utils/combinedAbortSignal.js'
import {
  DEFAULT_OUTPUT_STYLE_NAME,
  getAllOutputStyles,
} from 'src/constants/outputStyles.js'
import { getAccountInformation } from 'src/utils/auth.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import type { HookCallbackMatcher } from 'src/types/hooks.js'
import {
  type AgentDefinition,
  isBuiltInAgent,
  parseAgentsFromJson,
} from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { getCwd } from 'src/utils/cwd.js'
import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import {
  isFastModeAvailable,
  isFastModeEnabled,
  getFastModeState,
} from 'src/utils/fastMode.js'
import { parseUserSpecifiedModel } from 'src/utils/model/model.js'
import { AwsAuthStatusManager } from 'src/utils/awsAuthStatusManager.js'
import type { Stream } from 'src/utils/stream.js'
import type {
  RuntimeHeadlessControlStateProvider,
  RuntimePromptStateProvider,
  RuntimeSessionIdentityStateProvider,
} from '../../../core/state/providers.js'

type HeadlessControlStateProvider = RuntimeHeadlessControlStateProvider &
  RuntimePromptStateProvider &
  RuntimeSessionIdentityStateProvider

type PromptValue = string | ContentBlockParam[]

function toBlocks(v: PromptValue): ContentBlockParam[] {
  return typeof v === 'string' ? [{ type: 'text', text: v }] : v
}

export function joinPromptValues(values: PromptValue[]): PromptValue {
  if (values.length === 1) return values[0]!
  if (values.every(v => typeof v === 'string')) {
    return values.join('\n')
  }
  return values.flatMap(toBlocks)
}

export function canBatchWith(
  head: QueuedCommand,
  next: QueuedCommand | undefined,
): boolean {
  return (
    next !== undefined &&
    next.mode === 'prompt' &&
    next.workload === head.workload &&
    next.isMeta === head.isMeta
  )
}

export function getStructuredIO(
  inputPrompt: string | AsyncIterable<string>,
  sessionId: string,
  options: {
    sdkUrl: string | undefined
    replayUserMessages?: boolean
  },
): StructuredIO {
  let inputStream: AsyncIterable<string>
  if (typeof inputPrompt === 'string') {
    if (inputPrompt.trim() !== '') {
      inputStream = fromArray([
        jsonStringify({
          type: 'user',
          content: inputPrompt,
          uuid: '',
          session_id: '',
          message: {
            role: 'user',
            content: inputPrompt,
          },
          parent_tool_use_id: null,
        } satisfies ProtocolUserMessage),
      ])
    } else {
      inputStream = fromArray([])
    }
  } else {
    inputStream = inputPrompt
  }

  return options.sdkUrl
    ? new RemoteIO(
        options.sdkUrl,
        sessionId,
        inputStream,
        options.replayUserMessages,
      )
    : new StructuredIO(inputStream, options.replayUserMessages)
}

export function createCanUseToolWithPermissionPrompt(
  permissionPromptTool: PermissionPromptTool,
  permissionOptions: StructuredIOPermissionOptions = {},
): CanUseToolFn {
  const canUseTool: CanUseToolFn = async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    const permissionToolUseContext =
      permissionOptions.permissionBroker && !toolUseContext.runtimePermission
        ? {
            ...toolUseContext,
            runtimePermission: createToolPermissionRuntimeContext({
              permissionBroker: permissionOptions.permissionBroker,
              getConversationId: permissionOptions.getConversationId,
              getTurnId: permissionOptions.getTurnId,
            }),
          }
        : toolUseContext
    const mainPermissionResult =
      forceDecision ??
      (await hasPermissionsToUseTool(
        tool,
        input,
        permissionToolUseContext,
        assistantMessage,
        toolUseId,
      ))

    if (
      mainPermissionResult.behavior === 'allow' ||
      mainPermissionResult.behavior === 'deny'
    ) {
      recordResolvedPermissionDecision({
        broker: permissionOptions.permissionBroker,
        tool,
        input,
        toolUseContext: permissionToolUseContext,
        toolUseID: toolUseId,
        permissionResult: mainPermissionResult,
        permissionOptions,
      })
      return mainPermissionResult
    }

    const permissionBroker = permissionOptions.permissionBroker
    if (permissionBroker) {
      const permissionPromptAbortController = createChildAbortController(
        permissionToolUseContext.abortController,
      )
      if (permissionPromptAbortController.signal.aborted) {
        return permissionPromptAbortDecision(permissionPromptTool.name)
      }

      const permissionPromptContext = {
        ...permissionToolUseContext,
        abortController: permissionPromptAbortController,
      }
      const requestId = randomUUID()
      const permissionRequest = createStructuredPermissionRequest({
        tool,
        input,
        toolUseContext: permissionToolUseContext,
        toolUseID: toolUseId,
        requestId,
        permissionResult: mainPermissionResult,
        permissionOptions,
      })
      const brokerPromise =
        permissionBroker.requestPermission(permissionRequest)

      try {
        const toolCallPromise = permissionPromptTool
          .call(
            {
              tool_name: tool.name,
              input,
              tool_use_id: toolUseId,
            },
            permissionPromptContext,
            canUseTool,
            assistantMessage,
          )
          .then(result => {
            const permissionToolResultBlockParam =
              permissionPromptTool.mapToolResultToToolResultBlockParam(
                result.data,
                '1',
              )
            if (
              !permissionToolResultBlockParam.content ||
              !Array.isArray(permissionToolResultBlockParam.content) ||
              !permissionToolResultBlockParam.content[0] ||
              permissionToolResultBlockParam.content[0].type !== 'text' ||
              typeof permissionToolResultBlockParam.content[0].text !== 'string'
            ) {
              throw new Error(
                'Permission prompt tool returned an invalid result. Expected a single text block param with type="text" and a string text value.',
              )
            }
            const decision = kernelDecisionFromPermissionToolOutput(
              permissionToolOutputSchema().parse(
                safeParseJSON(permissionToolResultBlockParam.content[0].text),
              ),
              permissionRequest.permissionRequestId,
              'permission_prompt_tool_mcp',
            )
            decidePermissionSafely(permissionBroker, decision)
            return { source: 'mcp' as const, decision }
          })

        const brokerDecisionPromise = brokerPromise.then(decision => ({
          source: 'broker' as const,
          decision,
        }))

        const winner = await Promise.race([
          toolCallPromise,
          brokerDecisionPromise,
        ])
        if (winner.source === 'broker') {
          toolCallPromise.catch(() => {})
          const resolvedBy =
            winner.decision.metadata &&
            typeof winner.decision.metadata === 'object' &&
            'resolvedBy' in winner.decision.metadata
              ? winner.decision.metadata.resolvedBy
              : undefined
          if (resolvedBy !== 'permission_prompt_tool_mcp') {
            permissionPromptAbortController.abort()
          }
        }
        return permissionDecisionFromKernelDecision(
          winner.decision,
          permissionPromptTool,
          input,
          permissionToolUseContext,
          toolUseId,
        )
      } catch (error) {
        return permissionDecisionFromKernelDecision(
          {
            permissionRequestId: permissionRequest.permissionRequestId,
            decision: 'deny',
            decidedBy: 'runtime',
            reason: `Permission prompt tool failed: ${error}`,
            metadata: {
              resolvedBy: 'permission_prompt_tool_error',
            },
          },
          permissionPromptTool,
          input,
          permissionToolUseContext,
          toolUseId,
        )
      }
    }

    const { signal: combinedSignal, cleanup: cleanupAbortListener } =
      createCombinedAbortSignal(permissionToolUseContext.abortController.signal)

    if (combinedSignal.aborted) {
      cleanupAbortListener()
      return permissionPromptAbortDecision(permissionPromptTool.name)
    }

    const abortPromise = new Promise<'aborted'>(resolve => {
      combinedSignal.addEventListener('abort', () => resolve('aborted'), {
        once: true,
      })
    })

    const toolCallPromise = permissionPromptTool.call(
      {
        tool_name: tool.name,
        input,
        tool_use_id: toolUseId,
      },
      permissionToolUseContext,
      canUseTool,
      assistantMessage,
    )

    const raceResult = await Promise.race([toolCallPromise, abortPromise])
    cleanupAbortListener()

    if (raceResult === 'aborted' || combinedSignal.aborted) {
      return permissionPromptAbortDecision(permissionPromptTool.name)
    }

    const result = raceResult as Awaited<typeof toolCallPromise>
    const permissionToolResultBlockParam =
      permissionPromptTool.mapToolResultToToolResultBlockParam(result.data, '1')
    if (
      !permissionToolResultBlockParam.content ||
      !Array.isArray(permissionToolResultBlockParam.content) ||
      !permissionToolResultBlockParam.content[0] ||
      permissionToolResultBlockParam.content[0].type !== 'text' ||
      typeof permissionToolResultBlockParam.content[0].text !== 'string'
    ) {
      throw new Error(
        'Permission prompt tool returned an invalid result. Expected a single text block param with type="text" and a string text value.',
      )
    }
    return permissionPromptToolResultToPermissionDecision(
      permissionToolOutputSchema().parse(
        safeParseJSON(permissionToolResultBlockParam.content[0].text),
      ),
      permissionPromptTool,
      input,
      permissionToolUseContext,
    )
  }
  return canUseTool
}

function permissionPromptAbortDecision(permissionPromptToolName: string) {
  return {
    behavior: 'deny' as const,
    message: 'Permission prompt was aborted.',
    decisionReason: {
      type: 'permissionPromptTool' as const,
      permissionPromptToolName,
      toolResult: undefined,
    },
  }
}

export function getCanUseToolFn(
  permissionPromptToolName: string | undefined,
  structuredIO: StructuredIO,
  getMcpTools: () => Tool[],
  onPermissionPrompt?: (details: RequiresActionDetails) => void,
  permissionOptions?: StructuredIOPermissionOptions,
): CanUseToolFn {
  if (permissionPromptToolName === 'stdio') {
    return structuredIO.createCanUseTool(onPermissionPrompt, permissionOptions)
  }
  if (!permissionPromptToolName) {
    return async (
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseId,
      forceDecision,
    ) =>
      forceDecision ??
      (await hasPermissionsToUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseId,
      ))
  }
  let resolved: CanUseToolFn | null = null
  return async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
    toolUseId,
    forceDecision,
  ) => {
    if (!resolved) {
      const mcpTools = getMcpTools()
      const permissionPromptTool = mcpTools.find(t =>
        toolMatchesName(t, permissionPromptToolName),
      ) as PermissionPromptTool | undefined
      if (!permissionPromptTool) {
        const error = `Error: MCP tool ${permissionPromptToolName} (passed via --permission-prompt-tool) not found. Available MCP tools: ${mcpTools.map(t => t.name).join(', ') || 'none'}`
        process.stderr.write(`${error}\n`)
        gracefulShutdownSync(1)
        throw new Error(error)
      }
      if (!permissionPromptTool.inputJSONSchema) {
        const error = `Error: tool ${permissionPromptToolName} (passed via --permission-prompt-tool) must be an MCP tool`
        process.stderr.write(`${error}\n`)
        gracefulShutdownSync(1)
        throw new Error(error)
      }
      resolved = createCanUseToolWithPermissionPrompt(
        permissionPromptTool,
        permissionOptions,
      )
    }
    return resolved(
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseId,
      forceDecision,
    )
  }
}

export async function handleInitializeRequest(
  request: ProtocolControlInitializeRequest,
  requestId: string,
  initialized: boolean,
  output: Stream<ProtocolStdoutMessage>,
  commands: Command[],
  modelInfos: ModelInfo[],
  structuredIO: StructuredIO,
  enableAuthStatus: boolean,
  options: {
    systemPrompt: string | undefined
    appendSystemPrompt: string | undefined
    agent?: string | undefined
    userSpecifiedModel?: string | undefined
    [key: string]: unknown
  },
  agents: AgentDefinition[],
  getAppState: () => AppState,
  bootstrapStateProvider: HeadlessControlStateProvider,
): Promise<void> {
  if (initialized) {
    output.enqueue({
      type: 'control_response',
      response: {
        subtype: 'error',
        error: 'Already initialized',
        request_id: requestId,
        pending_permission_requests:
          structuredIO.getPendingPermissionRequests(),
      },
    })
    return
  }

  if (request.systemPrompt !== undefined) {
    options.systemPrompt = request.systemPrompt
  }
  if (request.appendSystemPrompt !== undefined) {
    options.appendSystemPrompt = request.appendSystemPrompt
  }
  if ((request as Record<string, unknown>).promptSuggestions !== undefined) {
    options.promptSuggestions = (
      request as Record<string, unknown>
    ).promptSuggestions
  }

  if ((request as Record<string, unknown>).agents) {
    const stdinAgents = parseAgentsFromJson(
      (request as Record<string, unknown>).agents as string,
      'flagSettings',
    )
    agents.push(...stdinAgents)
  }

  if (options.agent) {
    const alreadyResolved =
      bootstrapStateProvider.getHeadlessControlState().mainThreadAgentType ===
      options.agent
    const mainThreadAgent = agents.find(a => a.agentType === options.agent)
    if (mainThreadAgent && !alreadyResolved) {
      bootstrapStateProvider.patchHeadlessControlState({
        mainThreadAgentType: mainThreadAgent.agentType,
      })

      if (!options.systemPrompt && !isBuiltInAgent(mainThreadAgent)) {
        const agentSystemPrompt = mainThreadAgent.getSystemPrompt()
        if (agentSystemPrompt) {
          options.systemPrompt = agentSystemPrompt
        }
      }

      if (
        !options.userSpecifiedModel &&
        mainThreadAgent.model &&
        mainThreadAgent.model !== 'inherit'
      ) {
        const agentModel = parseUserSpecifiedModel(mainThreadAgent.model)
        bootstrapStateProvider.patchPromptState({
          mainLoopModelOverride: agentModel,
        })
      }

      if (mainThreadAgent.initialPrompt) {
        structuredIO.prependUserMessage(mainThreadAgent.initialPrompt)
      }
    } else if (mainThreadAgent?.initialPrompt) {
      structuredIO.prependUserMessage(mainThreadAgent.initialPrompt)
    }
  }

  const settings = getSettings_DEPRECATED()
  const outputStyle = settings?.outputStyle || DEFAULT_OUTPUT_STYLE_NAME
  const availableOutputStyles = await getAllOutputStyles(getCwd())
  const accountInfo = getAccountInformation()

  if (request.hooks) {
    const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {}
    for (const [event, matchers] of Object.entries(request.hooks) as [
      string,
      Array<{ hookCallbackIds: string[]; timeout?: number; matcher?: string }>,
    ][]) {
      hooks[event as HookEvent] = matchers.map(matcher => {
        const callbacks = matcher.hookCallbackIds.map(callbackId => {
          return structuredIO.createHookCallback(callbackId, matcher.timeout)
        })
        return {
          matcher: matcher.matcher,
          hooks: callbacks,
        }
      })
    }
    bootstrapStateProvider.registerHookCallbacks(hooks)
  }
  if ((request as Record<string, unknown>).jsonSchema) {
    bootstrapStateProvider.patchHeadlessControlState({
      initJsonSchema: (request as Record<string, unknown>).jsonSchema as Record<
        string,
        unknown
      >,
    })
  }

  const initResponse: ProtocolControlInitializeResponse = {
    commands: commands
      .filter(cmd => cmd.userInvocable !== false)
      .map(cmd => ({
        name: getCommandName(cmd),
        description: formatDescriptionWithSource(cmd),
        argumentHint: cmd.argumentHint || '',
      })),
    agents: agents.map(agent => ({
      name: agent.agentType,
      description: agent.whenToUse,
      model: agent.model === 'inherit' ? undefined : agent.model,
    })),
    output_style: outputStyle,
    available_output_styles: Object.keys(availableOutputStyles),
    models: modelInfos as unknown as ProtocolControlInitializeResponse['models'],
    account: {
      email: accountInfo?.email,
      organization: accountInfo?.organization,
      subscriptionType: accountInfo?.subscription,
      tokenSource: accountInfo?.tokenSource,
      apiKeySource: accountInfo?.apiKeySource,
      apiProvider: getAPIProvider() as
        | 'firstParty'
        | 'bedrock'
        | 'vertex'
        | 'foundry',
    },
    pid: process.pid,
  }

  if (isFastModeEnabled() && isFastModeAvailable()) {
    const appState = getAppState()
    initResponse.fast_mode_state = getFastModeState(
      options.userSpecifiedModel ?? null,
      appState.fastMode,
    )
  }

  output.enqueue({
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: requestId,
      response: initResponse,
    },
  })

  if (enableAuthStatus) {
    const authStatusManager = AwsAuthStatusManager.getInstance()
    const status = authStatusManager.getStatus()
    if (status) {
      output.enqueue({
        type: 'auth_status',
        isAuthenticating: status.isAuthenticating,
        output: status.output,
        error: status.error,
        uuid: randomUUID(),
        session_id: bootstrapStateProvider.getSessionIdentity().sessionId,
      })
    }
  }
}
