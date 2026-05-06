import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import type { Message, NormalizedUserMessage } from 'src/types/message.js'
import type { ProtocolStdoutMessage } from 'src/types/protocol/controlTypes.js'
import { createAbortController } from 'src/utils/abortController.js'
import {
  createFileStateCacheWithSizeLimit,
  mergeFileStateCaches,
  READ_FILE_STATE_CACHE_SIZE,
  type FileState,
  type FileStateCache,
} from 'src/utils/fileStateCache.js'
import { extractReadFilesFromMessages } from 'src/utils/queryHelpers.js'
import type {
  AttachableRuntimeSession,
  IndexedRuntimeSession,
  RuntimeSessionIndexEntry,
  RuntimeSessionLifecycle,
  RuntimeSessionSink,
} from '../../../contracts/session.js'

export type HeadlessManagedSession = RuntimeSessionLifecycle &
  IndexedRuntimeSession &
  AttachableRuntimeSession<HeadlessManagedSessionSink> & {
  readonly messages: Message[]
  emitOutput(message: ProtocolStdoutMessage): void
  appendMessages(messages: Message[]): void
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

export type HeadlessManagedSessionSink = RuntimeSessionSink<ProtocolStdoutMessage>

export function createHeadlessManagedSession(
  initialMessages: Message[],
  options: {
    sessionId: string
    cwd: string
    getWorkDir?: () => string
    onUpdated?: (session: HeadlessManagedSession) => void
    onStopped?: (session: HeadlessManagedSession) => void
  },
): HeadlessManagedSession {
  let abortController: AbortController | undefined
  let isLive = true
  const createdAt = Date.now()
  let lastActiveAt = createdAt
  let readFileState = extractReadFilesFromMessages(
    initialMessages,
    options.cwd,
    READ_FILE_STATE_CACHE_SIZE,
  )
  const pendingSeeds = createFileStateCacheWithSizeLimit(
    READ_FILE_STATE_CACHE_SIZE,
  )
  const sinks = new Set<HeadlessManagedSessionSink>()

  const touch = () => {
    lastActiveAt = Date.now()
    options.onUpdated?.(session)
  }

  const session: HeadlessManagedSession = {
    id: options.sessionId,
    get workDir() {
      return options.getWorkDir?.() ?? options.cwd
    },
    get isLive() {
      return isLive
    },
    messages: initialMessages,
    attachSink(sink) {
      sinks.add(sink)
    },
    detachSink(sink) {
      sinks.delete(sink)
    },
    emitOutput(message) {
      for (const sink of sinks) {
        sink.send(message)
      }
      touch()
    },
    appendMessages(messages) {
      if (messages.length === 0) {
        return
      }
      initialMessages.push(...messages)
      touch()
    },
    resumeInterruptedTurn(interruptedUserMessage) {
      const interruptedIndex = initialMessages.findIndex(
        message => message.uuid === interruptedUserMessage.uuid,
      )
      if (interruptedIndex !== -1) {
        initialMessages.splice(interruptedIndex, 2)
      }
      touch()
      return interruptedUserMessage.message!.content as
        | string
        | ContentBlockParam[]
    },
    startTurn() {
      abortController = createAbortController()
      touch()
      return abortController
    },
    getAbortController() {
      return abortController
    },
    abortActiveTurn(reason) {
      abortController?.abort(reason)
      touch()
    },
    async stopAndWait(force = false) {
      if (!isLive) {
        return
      }
      isLive = false
      abortController?.abort(force ? 'shutdown' : 'stop')
      abortController = undefined
      options.onStopped?.(session)
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
      touch()
    },
    seedReadFileState(path, fileState) {
      pendingSeeds.set(path, fileState)
      touch()
    },
    toIndexEntry(): RuntimeSessionIndexEntry {
      return {
        sessionId: session.id,
        transcriptSessionId: session.id,
        cwd: session.workDir,
        createdAt,
        lastActiveAt,
      }
    },
  }

  return session
}
