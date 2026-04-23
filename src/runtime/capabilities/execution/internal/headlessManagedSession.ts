import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import { createAbortController } from 'src/utils/abortController.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
  type FileState,
  type FileStateCache,
} from 'src/utils/fileStateCache.js'
import { extractReadFilesFromMessages } from 'src/utils/queryHelpers.js'
import type { RuntimeSessionLifecycle } from '../../../contracts/session.js'

export type HeadlessManagedSession = RuntimeSessionLifecycle & {
  readonly messages: Message[]
  resumeInterruptedTurn(
    interruptedUserMessage: NormalizedUserMessage,
  ): string | ContentBlockParam[]
  startTurn(): AbortController
  getAbortController(): AbortController | undefined
  abortActiveTurn(reason?: unknown): void
  getCommittedReadFileState(): FileStateCache
  getReadFileCache(): FileStateCache
  commitReadFileCache(cache: FileStateCache): void
  seedReadFileState(path: string, fileState: FileState): void
}

export function createHeadlessManagedSession(
  initialMessages: Message[],
  options: {
    sessionId: string
    cwd: string
  },
): HeadlessManagedSession {
  let abortController: AbortController | undefined
  let isLive = true
  let readFileState = extractReadFilesFromMessages(
    initialMessages,
    options.cwd,
    READ_FILE_STATE_CACHE_SIZE,
  )
  const pendingSeeds = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )

  return {
    id: options.sessionId,
    workDir: options.cwd,
    get isLive() {
      return isLive
    },
    messages: initialMessages,
    resumeInterruptedTurn(interruptedUserMessage) {
      const interruptedIndex = initialMessages.findIndex(
        message => message.uuid === interruptedUserMessage.uuid,
      )
      if (interruptedIndex !== -1) {
        initialMessages.splice(interruptedIndex, 2)
      }
      return interruptedUserMessage.message!.content as
        | string
        | ContentBlockParam[]
    },
    startTurn() {
      abortController = createAbortController()
      return abortController
    },
    getAbortController() {
      return abortController
    },
    abortActiveTurn(reason) {
      abortController?.abort(reason)
    },
    async stopAndWait(force = false) {
      if (!isLive) {
        return
      }
      isLive = false
      abortController?.abort(force ? 'shutdown' : 'stop')
      abortController = undefined
    },
    getCommittedReadFileState() {
      return readFileState
    },
    getReadFileCache() {
      return pendingSeeds.size === 0
        ? readFileState
        : mergeFileStateCaches(readFileState, pendingSeeds)
    },
    commitReadFileCache(cache) {
      readFileState = cache
      for (const [path, seed] of pendingSeeds.entries()) {
        const existing = readFileState.get(path)
        if (!existing || seed.timestamp > existing.timestamp) {
          readFileState.set(path, seed)
        }
      }
      pendingSeeds.clear()
    },
    seedReadFileState(path, fileState) {
      pendingSeeds.set(path, fileState)
    },
  }
}
