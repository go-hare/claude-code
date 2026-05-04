import type {
  KernelCapabilityPlane,
  KernelCapabilityPlaneDenial,
} from '../../contracts/capability.js'
import type {
  KernelPermissionDecision,
  KernelPermissionRequest,
} from '../../contracts/permissions.js'
import {
  createKernelCapabilityPlane,
  toolCapabilityName,
} from '../CapabilityPlane.js'

export function createRuntimePermissionCapabilityPlane(
  request: KernelPermissionRequest,
  decision?: KernelPermissionDecision,
): KernelCapabilityPlane {
  const capability = toolCapabilityName(request.toolName)
  const granted = isPermissionAllowed(decision)
  const denial = decision && !granted
    ? getPermissionCapabilityDenial(capability, decision)
    : undefined

  return createKernelCapabilityPlane({
    runtimeSupports: [capability],
    hostGrants: granted ? [capability] : [],
    modePermits: granted ? [capability] : [],
    toolRequires: [capability],
    denies: denial ? [denial] : undefined,
    metadata: {
      source: 'permission_broker',
      permissionRequestId: request.permissionRequestId,
      toolName: request.toolName,
      action: request.action,
      risk: request.risk,
      decision: decision?.decision,
      decidedBy: decision?.decidedBy,
    },
  })
}

function isPermissionAllowed(
  decision: KernelPermissionDecision | undefined,
): boolean {
  return (
    decision?.decision === 'allow' ||
    decision?.decision === 'allow_once' ||
    decision?.decision === 'allow_session'
  )
}

function getPermissionCapabilityDenial(
  capability: string,
  decision: KernelPermissionDecision,
): KernelCapabilityPlaneDenial {
  return {
    capability,
    actor: getDenialActor(decision),
    reason: `permission_${decision.decision}`,
    metadata: {
      decidedBy: decision.decidedBy,
      reason: decision.reason,
    },
  }
}

function getDenialActor(
  decision: KernelPermissionDecision,
): KernelCapabilityPlaneDenial['actor'] {
  switch (decision.decidedBy) {
    case 'host':
    case 'timeout':
      return 'host'
    case 'policy':
      return 'mode'
    default:
      return 'runtime'
  }
}
