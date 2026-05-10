import {
  addToTotalDurationState,
  getIsNonInteractiveSession,
  getInvokedSkillsForAgent,
  getTeleportedSessionInfo,
  markFirstTeleportMessageLogged,
} from 'src/bootstrap/state.js'
import { createBootstrapStateProvider } from './adapters.js'

const bootstrapStateProvider = createBootstrapStateProvider()

export function createRuntimePromptStateProvider() {
  return {
    getPromptState: bootstrapStateProvider.getPromptState,
    patchPromptState: bootstrapStateProvider.patchPromptState,
  }
}

export function createRuntimeRequestDebugStateProvider() {
  return {
    getRequestDebugState: bootstrapStateProvider.getRequestDebugState,
    patchRequestDebugState: bootstrapStateProvider.patchRequestDebugState,
  }
}

export function createRuntimeSessionIdentityStateProvider() {
  return {
    getSessionIdentity: bootstrapStateProvider.getSessionIdentity,
    getIsNonInteractiveSession,
  }
}

export function createRuntimeCompactionStateProvider() {
  return {
    consumePostCompaction: bootstrapStateProvider.consumePostCompaction,
    markPostCompaction: bootstrapStateProvider.markPostCompaction,
  }
}

export function createRuntimeInvokedSkillStateProvider() {
  return {
    getInvokedSkillsForAgent,
  }
}

export function createRuntimeTeleportStateProvider() {
  return {
    getTeleportedSessionInfo,
    markFirstTeleportMessageLogged,
  }
}

export function createRuntimeUsageStateProvider() {
  return {
    addToTotalDurationState,
  }
}
