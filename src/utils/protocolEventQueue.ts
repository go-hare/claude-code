export {
  drainSdkEvents as drainProtocolEvents,
  emitTaskTerminatedSdk,
  enqueueSdkEvent as enqueueProtocolQueuedEvent,
} from './sdkEventQueue.js'

export type { SdkEvent as ProtocolQueuedEvent } from './sdkEventQueue.js'

import { enqueueSdkEvent } from './sdkEventQueue.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'

export function enqueueProtocolCompatibilityMessages(
  messages: SDKMessage[],
): void {
  for (const message of messages) {
    enqueueSdkEvent(message as never)
  }
}
