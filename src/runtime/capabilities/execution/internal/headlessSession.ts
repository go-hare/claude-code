export {
  createHeadlessSessionContext,
  handleChannelEnable,
  handleOrphanedPermissionResponse,
  handleSetPermissionMode,
  reregisterChannelHandlerAfterReconnect,
} from './headlessSessionControl.js'
import { runHeadlessRuntimeLoop } from './headlessRuntimeLoop.js'
import { createHeadlessSessionContext } from './headlessSessionControl.js'

type RunHeadlessArgs = Parameters<typeof runHeadlessRuntimeLoop> extends [
  ...infer Args,
  unknown,
]
  ? Args
  : never

export async function runHeadless(
  ...args: RunHeadlessArgs
): ReturnType<typeof runHeadlessRuntimeLoop> {
  const session = createHeadlessSessionContext()
  return runHeadlessRuntimeLoop(...args, session)
}
