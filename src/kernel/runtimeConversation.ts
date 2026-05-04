import { randomUUID } from 'crypto'

import type {
  KernelConversationId,
  KernelConversationSnapshot,
} from '../runtime/contracts/conversation.js'
import type {
  KernelRuntimeEnvelopeBase,
  KernelRuntimeEventSink,
} from '../runtime/contracts/events.js'
import type {
  KernelTurnId,
  KernelTurnRunRequest,
  KernelTurnSnapshot,
} from '../runtime/contracts/turn.js'
import type { KernelRuntimeCommand } from '../runtime/contracts/wire.js'
import type { KernelRuntimeWireClient } from './wireProtocol.js'
import type {
  KernelAbortTurnOptions,
  KernelConversation,
  KernelRunTurnAndWaitOptions,
  KernelRunTurnOptions,
  KernelRuntimeEventReplayOptions,
  KernelTurn,
  KernelWaitForTurnOptions,
} from './runtime.js'
import {
  collectReplayEvents,
  expectPayload,
  expectSuccess,
} from './runtimeEnvelope.js'
import { createKernelTurnFacade } from './runtimeTurn.js'
import { waitForTerminalTurn } from './runtimeTurnWait.js'

export function createKernelConversationFacade(options: {
  client: KernelRuntimeWireClient
  snapshot: KernelConversationSnapshot
}): KernelConversation {
  return new KernelConversationFacade(options)
}

class KernelConversationFacade implements KernelConversation {
  private currentSnapshot: KernelConversationSnapshot

  constructor(
    private readonly options: {
      client: KernelRuntimeWireClient
      snapshot: KernelConversationSnapshot
    },
  ) {
    this.currentSnapshot = options.snapshot
  }

  get id(): KernelConversationId {
    return this.currentSnapshot.conversationId
  }

  get workspacePath(): string {
    return this.currentSnapshot.workspacePath
  }

  get sessionId(): string | undefined {
    return this.currentSnapshot.sessionId
  }

  snapshot(): KernelConversationSnapshot {
    return this.currentSnapshot
  }

  async startTurn(
    prompt: KernelTurnRunRequest['prompt'],
    options: KernelRunTurnOptions = {},
  ): Promise<KernelTurn> {
    const snapshot = await this.runTurn(prompt, options)
    return createKernelTurnFacade({
      client: this.options.client,
      snapshot,
      onSnapshot: nextSnapshot => {
        this.updateFromTurnSnapshot(nextSnapshot)
      },
    })
  }

  async runTurn(
    prompt: KernelTurnRunRequest['prompt'],
    options: KernelRunTurnOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const snapshot = expectPayload<KernelTurnSnapshot>(
      await this.options.client.runTurn({
        type: 'run_turn',
        conversationId: this.id,
        turnId: options.turnId ?? randomUUID(),
        prompt,
        attachments: options.attachments,
        providerOverride: options.providerOverride,
        executionMode: options.executionMode,
        contextAssembly: options.contextAssembly,
        capabilityPlane: options.capabilityPlane,
        metadata: options.metadata,
      }),
    )
    this.updateFromTurnSnapshot(snapshot)
    return snapshot
  }

  async waitForTurn(
    turnId: KernelTurnId,
    options: KernelWaitForTurnOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const snapshot = await waitForTerminalTurn(this.options.client, {
      ...options,
      conversationId: this.id,
      turnId,
    })
    this.updateFromTurnSnapshot(snapshot)
    return snapshot
  }

  async runTurnAndWait(
    prompt: KernelTurnRunRequest['prompt'],
    options: KernelRunTurnAndWaitOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const turn = await this.startTurn(prompt, options)
    return turn.wait(options)
  }

  async abortTurn(
    turnId: KernelTurnId,
    options: KernelAbortTurnOptions = {},
  ): Promise<KernelTurnSnapshot> {
    const snapshot = expectPayload<KernelTurnSnapshot>(
      await this.options.client.abortTurn({
        type: 'abort_turn',
        conversationId: this.id,
        turnId,
        reason: options.reason,
        metadata: options.metadata,
      }),
    )
    this.updateFromTurnSnapshot(snapshot)
    return snapshot
  }

  onEvent(handler: KernelRuntimeEventSink): () => void {
    return this.options.client.onEvent(envelope => {
      if (envelope.conversationId === this.id) {
        handler(envelope)
      }
    })
  }

  replayEvents(
    options: Omit<KernelRuntimeEventReplayOptions, 'conversationId'> = {},
  ): Promise<KernelRuntimeEnvelopeBase[]> {
    return collectReplayEvents(this.options.client, {
      ...options,
      conversationId: this.id,
    })
  }

  async dispose(reason = 'conversation_disposed'): Promise<void> {
    expectSuccess(
      await this.options.client.request<
        Extract<KernelRuntimeCommand, { type: 'dispose_conversation' }>
      >({
        type: 'dispose_conversation',
        conversationId: this.id,
        reason,
      }),
    )
    this.currentSnapshot = {
      ...this.currentSnapshot,
      state: 'disposed',
      activeTurnId: undefined,
      updatedAt: new Date().toISOString(),
    }
  }

  private updateFromTurnSnapshot(snapshot: KernelTurnSnapshot): void {
    this.currentSnapshot = {
      ...this.currentSnapshot,
      state: conversationStateFromTurn(snapshot),
      activeTurnId:
        snapshot.state === 'completed' || snapshot.state === 'failed'
          ? undefined
          : snapshot.turnId,
      updatedAt: new Date().toISOString(),
    }
  }
}

function conversationStateFromTurn(
  snapshot: KernelTurnSnapshot,
): KernelConversationSnapshot['state'] {
  if (snapshot.state === 'aborting') {
    return 'aborting'
  }
  if (snapshot.state === 'running' || snapshot.state === 'starting') {
    return 'running'
  }
  if (snapshot.state === 'failed') {
    return 'failed'
  }
  return 'ready'
}
