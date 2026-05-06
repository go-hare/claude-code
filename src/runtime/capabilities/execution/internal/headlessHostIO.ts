import type { ProtocolMessage } from 'src/types/protocol/index.js'
import { gracefulShutdownSync } from 'src/utils/gracefulShutdown.js'
import { writeToStdout } from 'src/utils/process.js'
import { installStreamJsonStdoutGuard } from 'src/utils/streamJsonStdoutGuard.js'
import { registerProcessOutputErrorHandlers } from 'src/utils/process.js'
import { jsonStringify } from '../../../../utils/slowOperations.js'

export function installHeadlessStreamJsonGuard(outputFormat: string | undefined): void {
  if (outputFormat === 'stream-json') {
    installStreamJsonStdoutGuard()
  }
}

export function registerHeadlessOutputHandlers(): void {
  registerProcessOutputErrorHandlers()
}

export function writeHeadlessStderr(message: string): void {
  process.stderr.write(message)
}

export function failHeadless(
  message: string,
  exitCode = 1,
  reason?: Parameters<typeof gracefulShutdownSync>[1],
): void {
  writeHeadlessStderr(message)
  gracefulShutdownSync(exitCode, reason)
}

export function completeHeadlessRewind(messageId: string): void {
  process.stdout.write(`Files rewound to state at message ${messageId}\n`)
  gracefulShutdownSync(0)
}

export function writeHeadlessResult(
  lastMessage: ProtocolMessage | undefined,
  messages: ProtocolMessage[],
  options: {
    outputFormat: string | undefined
    verbose: boolean | undefined
    maxTurns: number | undefined
    maxBudgetUsd: number | undefined
  },
): void {
  switch (options.outputFormat) {
    case 'json':
      if (!lastMessage || lastMessage.type !== 'result') {
        throw new Error('No messages returned')
      }
      if (options.verbose) {
        writeToStdout(jsonStringify(messages) + '\n')
        return
      }
      writeToStdout(jsonStringify(lastMessage) + '\n')
      return
    case 'stream-json':
      return
    default:
      if (!lastMessage || lastMessage.type !== 'result') {
        throw new Error('No messages returned')
      }
      switch (lastMessage.subtype) {
        case 'success':
          writeToStdout(
            (lastMessage.result as string).endsWith('\n')
              ? (lastMessage.result as string)
              : (lastMessage.result as string) + '\n',
          )
          return
        case 'error_during_execution':
          writeToStdout('Execution error')
          return
        case 'error_max_turns':
          writeToStdout(`Error: Reached max turns (${options.maxTurns})`)
          return
        case 'error_max_budget_usd':
          writeToStdout(`Error: Exceeded USD budget (${options.maxBudgetUsd})`)
          return
        case 'error_max_structured_output_retries':
          writeToStdout(
            'Error: Failed to provide valid structured output after maximum retries',
          )
          return
      }
  }
}

export function finalizeHeadlessResult(lastMessage: ProtocolMessage | undefined): void {
  gracefulShutdownSync(
    lastMessage?.type === 'result' && lastMessage?.is_error ? 1 : 0,
  )
}

export function shutdownHeadless(exitCode = 1): void {
  gracefulShutdownSync(exitCode)
}
