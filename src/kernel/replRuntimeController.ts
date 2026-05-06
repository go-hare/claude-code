import type { AgentDefinitionsResult } from '@go-hare/builtin-tools/tools/AgentTool/loadAgentsDir.js'

import {
  materializeRuntimeToolSet,
  refreshRuntimeAgentDefinitions,
  type RuntimeToolSetInput,
} from '../runtime/capabilities/execution/headlessCapabilityMaterializer.js'
import {
  prepareReplRuntimeQuery,
  runReplRuntimeQuery,
  type PreparedReplRuntimeQuery,
  type ReplQueryRuntimeEvent,
} from '../runtime/capabilities/execution/internal/replQueryRuntime.js'
import {
  createRuntimePermissionService,
  type RuntimePermissionService,
  type RuntimePermissionServiceOptions,
} from '../runtime/capabilities/permissions/RuntimePermissionService.js'
import type { KernelRuntimeEnvelopeBase } from '../runtime/contracts/events.js'
import { createKernelRuntimeEventFacade } from '../runtime/core/events/KernelRuntimeEventFacade.js'
import { RuntimeEventBus } from '../runtime/core/events/RuntimeEventBus.js'

export type {
  KernelRuntimeEnvelopeBase,
  PreparedReplRuntimeQuery as KernelPreparedReplRuntimeQuery,
  ReplQueryRuntimeEvent as KernelReplQueryRuntimeEvent,
}

export {
  createKernelRuntimeEventFacade,
  prepareReplRuntimeQuery as prepareKernelReplRuntimeQuery,
  runReplRuntimeQuery as runKernelReplRuntimeQuery,
}

export function createKernelReplRuntimeEventBus(options: {
  runtimeId: string
}): RuntimeEventBus {
  return new RuntimeEventBus(options)
}

export function createKernelReplPermissionService(
  options: RuntimePermissionServiceOptions,
): RuntimePermissionService {
  return createRuntimePermissionService(options)
}

export function materializeKernelReplRuntimeToolSet(
  input: RuntimeToolSetInput,
) {
  return materializeRuntimeToolSet(input)
}

export function refreshKernelReplRuntimeAgentDefinitions(options: {
  cwd: string
  activeFromAll?: boolean
}): Promise<AgentDefinitionsResult> {
  return refreshRuntimeAgentDefinitions(options)
}
