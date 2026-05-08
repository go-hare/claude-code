import type {
  RuntimeCommandExecutionResult,
  RuntimeCommandGraphEntry,
  RuntimeCommandKind,
  RuntimeCommandResult,
} from '../runtime/contracts/command.js'
import type { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'
import type { Command, LocalCommandResult } from '../types/command.js'
import { runWithCwdOverride } from '../utils/cwd.js'
import {
  contentBlocksToText,
  createKernelRuntimeNonInteractiveToolUseContext,
} from './nonInteractiveToolUseContext.js'

type Awaitable<T> = T | Promise<T>

export type CommandGraphCoreRequestContext = {
  cwd?: string
  metadata?: Record<string, unknown>
}

export type CommandGraphCoreCatalog = {
  listCommands(context?: CommandGraphCoreRequestContext): Awaitable<
    readonly RuntimeCommandGraphEntry[]
  >
  executeCommand?(
    request: {
      name: string
      args?: string
      source?: 'cli' | 'repl' | 'bridge' | 'daemon' | 'sdk' | 'test'
      metadata?: Record<string, unknown>
    },
    context?: CommandGraphCoreRequestContext,
  ): Awaitable<RuntimeCommandExecutionResult>
}

export type CommandGraphCoreServiceOptions = {
  workspacePath?: string
  eventBus?: RuntimeEventBus
  commandCatalog?: CommandGraphCoreCatalog
}

export class CommandGraphCoreService {
  private readonly commandCatalog: CommandGraphCoreCatalog

  constructor(private readonly options: CommandGraphCoreServiceOptions = {}) {
    this.commandCatalog =
      options.commandCatalog ??
      createDefaultCommandGraphCoreCatalog(options.workspacePath)
  }

  listCommands(): Promise<readonly RuntimeCommandGraphEntry[]> {
    return Promise.resolve(
      this.commandCatalog.listCommands({
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: { protocol: 'json-rpc-lite' },
      }),
    )
  }

  async executeCommand(request: {
    name: string
    args?: string
    source?: 'cli' | 'repl' | 'bridge' | 'daemon' | 'sdk' | 'test'
    metadata?: Record<string, unknown>
  }): Promise<RuntimeCommandExecutionResult> {
    const executeCommand = this.commandCatalog.executeCommand
    if (!executeCommand) {
      throw new CommandGraphCoreError(
        'unavailable',
        'Command execution is not available',
      )
    }
    const result = await executeCommand(
      {
        name: request.name,
        args: request.args,
        source: request.source ?? 'sdk',
        metadata: request.metadata,
      },
      {
        cwd: this.options.workspacePath ?? process.cwd(),
        metadata: request.metadata,
      },
    )
    this.options.eventBus?.emit({
      type: 'commands.executed',
      replayable: true,
      payload: stripUndefined(result),
      metadata: request.metadata,
    })
    return result
  }
}

export class CommandGraphCoreError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly data?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'CommandGraphCoreError'
  }
}

function createDefaultCommandGraphCoreCatalog(
  workspacePath: string | undefined,
): CommandGraphCoreCatalog {
  const commandCache = new Map<string, readonly Command[]>()

  async function loadCommands(cwd: string): Promise<readonly Command[]> {
    const cached = commandCache.get(cwd)
    if (cached) {
      return cached
    }
    await prepareDefaultCommandGraphCatalogs()
    const { getCommands } = await import('../commands.js')
    const commands = await getCommands(cwd)
    commandCache.set(cwd, commands)
    return commands
  }

  return {
    async listCommands(context) {
      const { createRuntimeCommandGraph } = await import(
        '../runtime/capabilities/commands/runtimeCommandGraph.js'
      )
      const cwd = context?.cwd ?? workspacePath ?? process.cwd()
      return createRuntimeCommandGraph(await loadCommands(cwd))
    },
    async executeCommand(request, context) {
      const cwd = context?.cwd ?? workspacePath ?? process.cwd()
      return runWithCwdOverride(cwd, async () => {
        const [
          { findCommand },
          { getCommandName },
          { toRuntimeCommandDescriptor },
        ] = await Promise.all([
          import('../commands.js'),
          import('../types/command.js'),
          import('../runtime/capabilities/commands/runtimeCommandGraph.js'),
        ])
        const commands = await loadCommands(cwd)
        const command = findCommand(request.name, [...commands])
        if (!command) {
          return createRuntimeCommandTextResult({
            name: request.name,
            resultText: `Command not found: ${request.name}`,
            metadata: {
              ...request.metadata,
              error: 'not_found',
            },
          })
        }

        const descriptor = toRuntimeCommandDescriptor(command)
        const resultName = getCommandName(command)
        if (command.type === 'local-jsx') {
          return createRuntimeCommandTextResult({
            name: resultName,
            kind: descriptor.kind,
            resultText: `Command ${resultName} requires the interactive terminal UI.`,
            metadata: {
              ...request.metadata,
              unsupported: 'interactive_ui',
            },
          })
        }
        if (command.type === 'prompt') {
          if (command.disableNonInteractive) {
            return createRuntimeCommandTextResult({
              name: resultName,
              kind: descriptor.kind,
              resultText: `Command ${resultName} is disabled for non-interactive execution.`,
              metadata: {
                ...request.metadata,
                unsupported: 'non_interactive',
              },
            })
          }
          const promptBlocks = await command.getPromptForCommand(
            request.args ?? '',
            await createKernelRuntimeNonInteractiveToolUseContext(
              commands,
              cwd,
            ),
          )
          const text = contentBlocksToText(promptBlocks)
          return {
            name: resultName,
            kind: descriptor.kind,
            result: {
              type: 'query',
              prompt: text,
              text,
            },
            metadata: stripUndefined({
              ...request.metadata,
              source: command.source,
              loadedFrom: command.loadedFrom,
              allowedTools: command.allowedTools,
              model: command.model,
              effort: command.effort,
              contentBlocks: promptBlocks,
            }),
          }
        }
        if (!command.supportsNonInteractive) {
          return createRuntimeCommandTextResult({
            name: resultName,
            kind: descriptor.kind,
            resultText: `Command ${resultName} is not safe for non-interactive execution.`,
            metadata: {
              ...request.metadata,
              unsupported: 'non_interactive',
            },
          })
        }
        const module = await command.load()
        const commandContext =
          await createKernelRuntimeNonInteractiveToolUseContext(
            commands,
            cwd,
          )
        return {
          name: resultName,
          kind: descriptor.kind,
          result: mapLocalCommandResult(
            await module.call(request.args ?? '', commandContext),
          ),
          metadata: request.metadata,
        }
      })
    },
  }
}

async function prepareDefaultCommandGraphCatalogs(): Promise<void> {
  ensureDefaultKernelMacroFallback()
  if (process.env.NODE_ENV === 'test') {
    return
  }
  const { enableConfigs } = await import('../utils/config.js')
  enableConfigs()
}

type DefaultKernelRuntimeMacro = {
  VERSION: string
  BUILD_TIME: string
  FEEDBACK_CHANNEL: string
  ISSUES_EXPLAINER: string
  NATIVE_PACKAGE_URL: string
  PACKAGE_URL: string
  VERSION_CHANGELOG: string
}

function ensureDefaultKernelMacroFallback(): void {
  const globalWithMacro = globalThis as typeof globalThis & {
    MACRO?: Partial<DefaultKernelRuntimeMacro>
  }
  globalWithMacro.MACRO = {
    VERSION: process.env.CLAUDE_CODE_VERSION ?? '0.0.0-kernel',
    BUILD_TIME: '',
    FEEDBACK_CHANNEL: '',
    ISSUES_EXPLAINER: '',
    NATIVE_PACKAGE_URL: '',
    PACKAGE_URL: '',
    VERSION_CHANGELOG: '',
    ...globalWithMacro.MACRO,
  }
}

function createRuntimeCommandTextResult(input: {
  name: string
  kind?: RuntimeCommandKind
  resultText: string
  metadata?: Record<string, unknown>
}): RuntimeCommandExecutionResult {
  return {
    name: input.name,
    kind: input.kind,
    result: {
      type: 'text',
      text: input.resultText,
      display: 'system',
    },
    metadata: stripUndefined(input.metadata),
  }
}

function mapLocalCommandResult(
  result: LocalCommandResult,
): RuntimeCommandResult {
  switch (result.type) {
    case 'text':
      return {
        type: 'text',
        text: result.value,
        display: 'system',
      }
    case 'compact':
      return {
        type: 'compact',
        text: result.displayText,
      }
    case 'skip':
      return { type: 'skip' }
  }
}

function stripUndefined<T>(
  metadata: T | undefined,
): T | undefined {
  if (!metadata) {
    return undefined
  }
  if (Array.isArray(metadata)) {
    return metadata
      .filter(item => item !== undefined)
      .map(item => stripUndefined(item)) as T
  }
  if (typeof metadata === 'object') {
    const entries = Object.entries(metadata as Record<string, unknown>).filter(
      (entry): entry is [string, unknown] => entry[1] !== undefined,
    )
    return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined
  }
  return metadata
}
