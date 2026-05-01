import type {
  KernelCompanionEvent,
  KernelCompanionRuntime,
  KernelCompanionState,
} from './companion.js'
import type { KernelContextManager, KernelContextSnapshot } from './context.js'
import type {
  KernelKairosEvent,
  KernelKairosRuntime,
  KernelKairosStatus,
} from './kairos.js'
import type { KernelMemoryDescriptor, KernelMemoryDocument } from './memory.js'
import type { KernelSessionDescriptor, KernelTranscript } from './sessions.js'
import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../runtime/contracts/conversation.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import { expectPayload } from './runtimeEnvelope.js'
import { createKernelConversationFacade } from './runtimeConversation.js'
import type { KernelConversation } from './runtime.js'

export function createKernelRuntimeCompanionFacade(
  client: KernelRuntimeWireClient,
): KernelCompanionRuntime {
  return {
    async getState() {
      return expectPayload<{ state: KernelCompanionState | null }>(
        await client.getCompanionState(),
      ).state
    },
    async dispatch(action) {
      return expectPayload<{ state: KernelCompanionState | null }>(
        await client.dispatchCompanionAction({ action }),
      ).state
    },
    async reactToTurn(request) {
      await client.reactCompanion(request)
    },
    onEvent(handler) {
      return client.onEvent(envelope => {
        const event = extractRuntimeDomainEvent<KernelCompanionEvent>(
          envelope,
          'companion.event',
        )
        if (event) {
          handler(event)
        }
      })
    },
  }
}

export function createKernelRuntimeKairosFacade(
  client: KernelRuntimeWireClient,
): KernelKairosRuntime {
  async function getStatus(): Promise<KernelKairosStatus> {
    return expectPayload<{ status: KernelKairosStatus }>(
      await client.getKairosStatus(),
    ).status
  }

  return {
    getStatus,
    async enqueueEvent(event) {
      await client.enqueueKairosEvent({ event })
    },
    async tick(request) {
      await client.tickKairos(request ?? {})
    },
    async suspend(reason) {
      await client.suspendKairos({ reason })
    },
    async resume(reason) {
      await client.resumeKairos({ reason })
    },
    onEvent(handler) {
      return client.onEvent(envelope => {
        const event = extractRuntimeDomainEvent<KernelKairosEvent>(
          envelope,
          'kairos.event',
        )
        if (event) {
          handler(event)
        }
      })
    },
  }
}

export function createKernelRuntimeMemoryFacade(
  client: KernelRuntimeWireClient,
): {
  list(): Promise<readonly KernelMemoryDescriptor[]>
  read(id: string): Promise<KernelMemoryDocument>
  update(request: {
    id: string
    content: string
  }): Promise<KernelMemoryDocument>
} {
  return {
    async list() {
      return expectPayload<{ descriptors: readonly KernelMemoryDescriptor[] }>(
        await client.listMemory(),
      ).descriptors
    },
    async read(id) {
      return expectPayload<{ document: KernelMemoryDocument }>(
        await client.readMemory({ id }),
      ).document
    },
    async update(request) {
      return expectPayload<{ document: KernelMemoryDocument }>(
        await client.updateMemory(request),
      ).document
    },
  }
}

export function createKernelRuntimeContextFacade(
  client: KernelRuntimeWireClient,
): KernelContextManager {
  return {
    async read() {
      return expectPayload<{ snapshot: KernelContextSnapshot }>(
        await client.readContext(),
      ).snapshot
    },
    async getSystem() {
      return (await this.read()).system
    },
    async getUser() {
      return (await this.read()).user
    },
    async getGitStatus() {
      return expectPayload<{ gitStatus: string | null }>(
        await client.getContextGitStatus(),
      ).gitStatus
    },
    getSystemPromptInjection() {
      throw new Error(
        'Kernel runtime context prompt injection is asynchronous; use the runtime facade methods directly.',
      )
    },
    setSystemPromptInjection() {
      throw new Error(
        'Kernel runtime context prompt injection is asynchronous; use the runtime facade methods directly.',
      )
    },
  }
}

export type KernelRuntimeContextWithAsyncInjection = Omit<
  KernelContextManager,
  'getSystemPromptInjection' | 'setSystemPromptInjection'
> & {
  getSystemPromptInjection(): Promise<string | null>
  setSystemPromptInjection(value: string | null): Promise<string | null>
}

export function createKernelRuntimeAsyncContextFacade(
  client: KernelRuntimeWireClient,
): KernelRuntimeContextWithAsyncInjection {
  const base = createKernelRuntimeContextFacade(client)
  return {
    ...base,
    async getSystemPromptInjection() {
      return expectPayload<{ value: string | null }>(
        await client.getSystemPromptInjection(),
      ).value
    },
    async setSystemPromptInjection(value) {
      return expectPayload<{ value: string | null }>(
        await client.setSystemPromptInjection({ value }),
      ).value
    },
  }
}

export function createKernelRuntimeSessionFacade(
  client: KernelRuntimeWireClient,
): {
  list(
    filter?: {
      cwd?: string
      limit?: number
      offset?: number
      includeWorktrees?: boolean
    },
  ): Promise<readonly KernelSessionDescriptor[]>
  resume(
    sessionId: string,
    options?: {
      conversationId?: KernelConversationId
      workspacePath?: string
      resumeInterruptedTurn?: boolean
      resumeSessionAt?: string
      metadata?: Record<string, unknown>
    },
  ): Promise<KernelConversation>
  getTranscript(sessionId: string): Promise<KernelTranscript>
} {
  return {
    async list(filter = {}) {
      return expectPayload<{ sessions: readonly KernelSessionDescriptor[] }>(
        await client.listSessions(filter),
      ).sessions
    },
    async resume(sessionId, options = {}) {
      const snapshot = expectPayload<{ conversation: KernelConversationSnapshot }>(
        await client.resumeSession({
          sessionId,
          conversationId: options.conversationId,
          workspacePath: options.workspacePath,
          resumeInterruptedTurn: options.resumeInterruptedTurn,
          resumeSessionAt: options.resumeSessionAt,
          metadata: options.metadata,
        }),
      ).conversation
      return createKernelConversationFacade({
        client,
        snapshot,
      })
    },
    async getTranscript(sessionId) {
      return expectPayload<{ transcript: KernelTranscript }>(
        await client.getSessionTranscript({ sessionId }),
      ).transcript
    },
  }
}

function extractRuntimeDomainEvent<TEvent>(
  envelope: {
    kind: string
    payload?: unknown
  },
  type: string,
): TEvent | undefined {
  if (envelope.kind !== 'event' || !isRecord(envelope.payload)) {
    return undefined
  }
  if (envelope.payload.type !== type || !isRecord(envelope.payload.payload)) {
    return undefined
  }
  return envelope.payload.payload.event as TEvent | undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
