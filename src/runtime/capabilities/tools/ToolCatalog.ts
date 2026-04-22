// biome-ignore-all assist/source/organizeImports: runtime tool catalog keeps conditional import order stable
import type { Tool, Tools } from '../../../Tool.js'
import { AgentTool } from '@go-hare/builtin-tools/tools/AgentTool/AgentTool.js'
import { SkillTool } from '@go-hare/builtin-tools/tools/SkillTool/SkillTool.js'
import { BashTool } from '@go-hare/builtin-tools/tools/BashTool/BashTool.js'
import { FileEditTool } from '@go-hare/builtin-tools/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '@go-hare/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '@go-hare/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '@go-hare/builtin-tools/tools/GlobTool/GlobTool.js'
import { NotebookEditTool } from '@go-hare/builtin-tools/tools/NotebookEditTool/NotebookEditTool.js'
import { WebFetchTool } from '@go-hare/builtin-tools/tools/WebFetchTool/WebFetchTool.js'
import { TaskStopTool } from '@go-hare/builtin-tools/tools/TaskStopTool/TaskStopTool.js'
import { BriefTool } from '@go-hare/builtin-tools/tools/BriefTool/BriefTool.js'
// Dead code elimination: conditional import for ant-only tools
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const REPLTool =
  process.env.USER_TYPE === 'ant'
    ? require('@go-hare/builtin-tools/tools/REPLTool/REPLTool.js')
        .REPLTool
    : null
const SuggestBackgroundPRTool =
  process.env.USER_TYPE === 'ant'
    ? require('@go-hare/builtin-tools/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js')
        .SuggestBackgroundPRTool
    : null
const SleepTool =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('@go-hare/builtin-tools/tools/SleepTool/SleepTool.js')
        .SleepTool
    : null
const cronTools = [
  require('@go-hare/builtin-tools/tools/ScheduleCronTool/CronCreateTool.js')
    .CronCreateTool,
  require('@go-hare/builtin-tools/tools/ScheduleCronTool/CronDeleteTool.js')
    .CronDeleteTool,
  require('@go-hare/builtin-tools/tools/ScheduleCronTool/CronListTool.js')
    .CronListTool,
]
const RemoteTriggerTool = feature('AGENT_TRIGGERS_REMOTE')
  ? require('@go-hare/builtin-tools/tools/RemoteTriggerTool/RemoteTriggerTool.js')
      .RemoteTriggerTool
  : null
const MonitorTool = feature('MONITOR_TOOL')
  ? require('@go-hare/builtin-tools/tools/MonitorTool/MonitorTool.js')
      .MonitorTool
  : null
const SendUserFileTool = feature('KAIROS')
  ? require('@go-hare/builtin-tools/tools/SendUserFileTool/SendUserFileTool.js')
      .SendUserFileTool
  : null
const PushNotificationTool =
  feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
    ? require('@go-hare/builtin-tools/tools/PushNotificationTool/PushNotificationTool.js')
        .PushNotificationTool
    : null
const SubscribePRTool = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('@go-hare/builtin-tools/tools/SubscribePRTool/SubscribePRTool.js')
      .SubscribePRTool
  : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { TaskOutputTool } from '@go-hare/builtin-tools/tools/TaskOutputTool/TaskOutputTool.js'
import { WebSearchTool } from '@go-hare/builtin-tools/tools/WebSearchTool/WebSearchTool.js'
import { TodoWriteTool } from '@go-hare/builtin-tools/tools/TodoWriteTool/TodoWriteTool.js'
import { ExitPlanModeV2Tool } from '@go-hare/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { TestingPermissionTool } from '@go-hare/builtin-tools/tools/testing/TestingPermissionTool.js'
import { GrepTool } from '@go-hare/builtin-tools/tools/GrepTool/GrepTool.js'
import { TungstenTool } from '@go-hare/builtin-tools/tools/TungstenTool/TungstenTool.js'
// Lazy require to break circular dependency: tools.ts -> TeamCreateTool/TeamDeleteTool -> ... -> tools.ts
/* eslint-disable @typescript-eslint/no-require-imports */
const getTeamCreateTool = () =>
  require('@go-hare/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js')
    .TeamCreateTool as typeof import('@go-hare/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js').TeamCreateTool
const getTeamDeleteTool = () =>
  require('@go-hare/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js')
    .TeamDeleteTool as typeof import('@go-hare/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js').TeamDeleteTool
const getSendMessageTool = () =>
  require('@go-hare/builtin-tools/tools/SendMessageTool/SendMessageTool.js')
    .SendMessageTool as typeof import('@go-hare/builtin-tools/tools/SendMessageTool/SendMessageTool.js').SendMessageTool
/* eslint-enable @typescript-eslint/no-require-imports */
import { AskUserQuestionTool } from '@go-hare/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { LSPTool } from '@go-hare/builtin-tools/tools/LSPTool/LSPTool.js'
import { ListMcpResourcesTool } from '@go-hare/builtin-tools/tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { ReadMcpResourceTool } from '@go-hare/builtin-tools/tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { ToolSearchTool } from '@go-hare/builtin-tools/tools/ToolSearchTool/ToolSearchTool.js'
import { EnterPlanModeTool } from '@go-hare/builtin-tools/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { EnterWorktreeTool } from '@go-hare/builtin-tools/tools/EnterWorktreeTool/EnterWorktreeTool.js'
import { ExitWorktreeTool } from '@go-hare/builtin-tools/tools/ExitWorktreeTool/ExitWorktreeTool.js'
import { ConfigTool } from '@go-hare/builtin-tools/tools/ConfigTool/ConfigTool.js'
import { TaskCreateTool } from '@go-hare/builtin-tools/tools/TaskCreateTool/TaskCreateTool.js'
import { TaskGetTool } from '@go-hare/builtin-tools/tools/TaskGetTool/TaskGetTool.js'
import { TaskUpdateTool } from '@go-hare/builtin-tools/tools/TaskUpdateTool/TaskUpdateTool.js'
import { TaskListTool } from '@go-hare/builtin-tools/tools/TaskListTool/TaskListTool.js'
import { isToolSearchEnabledOptimistic } from '../../../utils/toolSearch.js'
import { isTodoV2Enabled } from '../../../utils/tasks.js'
// Dead code elimination: conditional import for CLAUDE_CODE_VERIFY_PLAN
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const VerifyPlanExecutionTool =
  process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'
    ? require('@go-hare/builtin-tools/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js')
        .VerifyPlanExecutionTool
    : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { feature } from 'bun:bundle'
// Dead code elimination: conditional import for OVERFLOW_TEST_TOOL
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const OverflowTestTool = feature('OVERFLOW_TEST_TOOL')
  ? require('@go-hare/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js')
      .OverflowTestTool
  : null
const CtxInspectTool = feature('CONTEXT_COLLAPSE')
  ? require('@go-hare/builtin-tools/tools/CtxInspectTool/CtxInspectTool.js')
      .CtxInspectTool
  : null
const TerminalCaptureTool = feature('TERMINAL_PANEL')
  ? require('@go-hare/builtin-tools/tools/TerminalCaptureTool/TerminalCaptureTool.js')
      .TerminalCaptureTool
  : null
const WebBrowserTool = feature('WEB_BROWSER_TOOL')
  ? require('@go-hare/builtin-tools/tools/WebBrowserTool/WebBrowserTool.js')
      .WebBrowserTool
  : null
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('../../../coordinator/coordinatorMode.js') as typeof import('../../../coordinator/coordinatorMode.js'))
  : null
const SnipTool = feature('HISTORY_SNIP')
  ? require('@go-hare/builtin-tools/tools/SnipTool/SnipTool.js').SnipTool
  : null
const ReviewArtifactTool = feature('REVIEW_ARTIFACT')
  ? require('@go-hare/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js')
      .ReviewArtifactTool
  : null
const ListPeersTool = feature('UDS_INBOX')
  ? require('@go-hare/builtin-tools/tools/ListPeersTool/ListPeersTool.js')
      .ListPeersTool
  : null
const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? (() => {
      require('@go-hare/builtin-tools/tools/WorkflowTool/bundled/index.js').initBundledWorkflows()
      return require('@go-hare/builtin-tools/tools/WorkflowTool/WorkflowTool.js')
        .WorkflowTool
    })()
  : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import { isPowerShellToolEnabled } from '../../../utils/shell/shellToolUtils.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { isWorktreeModeEnabled } from '../../../utils/worktreeModeEnabled.js'
import { isReplModeEnabled } from '@go-hare/builtin-tools/tools/REPLTool/constants.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const getPowerShellTool = () => {
  if (!isPowerShellToolEnabled()) return null
  return (
    require('@go-hare/builtin-tools/tools/PowerShellTool/PowerShellTool.js') as typeof import('@go-hare/builtin-tools/tools/PowerShellTool/PowerShellTool.js')
  ).PowerShellTool
}
/* eslint-enable @typescript-eslint/no-require-imports */

export function getSimpleModeTools(): Tool[] {
  if (isReplModeEnabled() && REPLTool) {
    const replSimple: Tool[] = [REPLTool]
    if (
      feature('COORDINATOR_MODE') &&
      coordinatorModeModule?.isCoordinatorMode()
    ) {
      replSimple.push(TaskStopTool, getSendMessageTool())
    }
    return replSimple
  }

  const simpleTools: Tool[] = [BashTool, FileReadTool, FileEditTool]
  if (
    feature('COORDINATOR_MODE') &&
    coordinatorModeModule?.isCoordinatorMode()
  ) {
    simpleTools.push(AgentTool, TaskStopTool, getSendMessageTool())
  }
  return simpleTools
}

/**
 * Get the complete exhaustive list of all tools that could be available
 * in the current environment (respecting process.env flags).
 * This is the source of truth for ALL tools.
 *
 * NOTE: This MUST stay in sync with
 * https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_code_global_system_caching
 * in order to cache the system prompt across users.
 */
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // Ant-native builds have bfs/ugrep embedded in the bun binary (same ARGV0
    // trick as ripgrep). When available, find/grep in Claude's shell are aliased
    // to these fast tools, so the dedicated Glob/Grep tools are unnecessary.
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    NotebookEditTool,
    WebFetchTool,
    TodoWriteTool,
    WebSearchTool,
    TaskStopTool,
    AskUserQuestionTool,
    SkillTool,
    EnterPlanModeTool,
    ...(process.env.USER_TYPE === 'ant' ? [ConfigTool] : []),
    ...(process.env.USER_TYPE === 'ant' ? [TungstenTool] : []),
    ...(SuggestBackgroundPRTool ? [SuggestBackgroundPRTool] : []),
    ...(WebBrowserTool ? [WebBrowserTool] : []),
    ...(isTodoV2Enabled()
      ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool]
      : []),
    ...(OverflowTestTool ? [OverflowTestTool] : []),
    ...(CtxInspectTool ? [CtxInspectTool] : []),
    ...(TerminalCaptureTool ? [TerminalCaptureTool] : []),
    ...(isEnvTruthy(process.env.ENABLE_LSP_TOOL) ? [LSPTool] : []),
    ...(isWorktreeModeEnabled() ? [EnterWorktreeTool, ExitWorktreeTool] : []),
    getSendMessageTool(),
    ...(ListPeersTool ? [ListPeersTool] : []),
    ...(isAgentSwarmsEnabled()
      ? [getTeamCreateTool(), getTeamDeleteTool()]
      : []),
    ...(VerifyPlanExecutionTool ? [VerifyPlanExecutionTool] : []),
    ...(process.env.USER_TYPE === 'ant' && REPLTool ? [REPLTool] : []),
    ...(WorkflowTool ? [WorkflowTool] : []),
    ...(SleepTool ? [SleepTool] : []),
    ...cronTools,
    ...(RemoteTriggerTool ? [RemoteTriggerTool] : []),
    ...(MonitorTool ? [MonitorTool] : []),
    BriefTool,
    ...(SendUserFileTool ? [SendUserFileTool] : []),
    ...(PushNotificationTool ? [PushNotificationTool] : []),
    ...(SubscribePRTool ? [SubscribePRTool] : []),
    ...(ReviewArtifactTool ? [ReviewArtifactTool] : []),
    ...(getPowerShellTool() ? [getPowerShellTool()] : []),
    ...(SnipTool ? [SnipTool] : []),
    ...(process.env.NODE_ENV === 'test' ? [TestingPermissionTool] : []),
    ListMcpResourcesTool,
    ReadMcpResourceTool,
    // Include ToolSearchTool when tool search might be enabled (optimistic check)
    // The actual decision to defer tools happens at request time in claude.ts
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []),
  ]
}
