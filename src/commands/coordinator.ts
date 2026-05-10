/**
 * /coordinator — Toggle coordinator (multi-worker orchestration) mode.
 *
 * When enabled, the CLI becomes an orchestrator that dispatches tasks
 * to worker agents via Agent({ subagent_type: "worker" }).
 * The coordinator can only use Agent, SendMessage, and TaskStop.
 */
import { feature } from 'bun:bundle'
import { getOriginalCwd } from '../bootstrap/state.js'
import type { ToolUseContext } from '../Tool.js'
import type {
  Command,
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../types/command.js'
import { refreshAgentDefinitionsFromCurrentState } from '../utils/agentDefinitionsRefresh.js'
import { saveMode } from '../utils/sessionStorage.js'

const coordinator = {
  type: 'local-jsx',
  name: 'coordinator',
  description: 'Toggle coordinator (multi-worker) mode',
  isEnabled: () => {
    if (feature('COORDINATOR_MODE')) {
      return true
    }
    return false
  },
  immediate: true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        context: ToolUseContext & LocalJSXCommandContext,
      ): Promise<React.ReactNode> {
        const mod =
          require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js')
        const shouldEnable = !mod.isCoordinatorMode()

        if (shouldEnable) {
          process.env.CLAUDE_CODE_COORDINATOR_MODE = '1'
        } else {
          delete process.env.CLAUDE_CODE_COORDINATOR_MODE
        }

        const refreshedAgentDefinitions =
          await refreshAgentDefinitionsFromCurrentState(
            getOriginalCwd(),
            context.getAppState().agentDefinitions,
          )

        context.setAppState(prev => ({
          ...prev,
          agentDefinitions: refreshedAgentDefinitions,
        }))

        saveMode(shouldEnable ? 'coordinator' : 'normal')

        if (!shouldEnable) {
          onDone('Coordinator mode disabled — back to normal mode', {
            display: 'system',
            metaMessages: [
              '<system-reminder>\nCoordinator mode is now disabled. You have access to all standard tools again. Work directly instead of dispatching to workers.\n</system-reminder>',
            ],
          })
        } else {
          onDone(
            'Coordinator mode enabled — use Agent(subagent_type: "worker") to dispatch tasks',
            {
              display: 'system',
              metaMessages: [
                '<system-reminder>\nCoordinator mode is now enabled. You are an orchestrator. Use Agent({ subagent_type: "worker" }) to spawn workers, SendMessage to continue them, TaskStop to stop them. Do not use other tools directly.\n</system-reminder>',
              ],
            },
          )
        }
        return null
      },
    }),
} satisfies Command

export default coordinator
