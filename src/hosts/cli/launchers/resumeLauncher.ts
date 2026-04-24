import { launchResumeChooser } from '../../../dialogLaunchers.js'
import { launchRepl } from '../../../replLauncher.js'
import { getWorktreePaths } from '../../../utils/getWorktreePaths.js'
import {
  buildResumeData,
  maybeLoadResumeFromFile,
  resolveResumeSelection,
  resumeBySessionId,
  waitForDownloadedFiles,
} from './resumeLauncherRecovery.js'
import type {
  ResumeLikeLaunchOptions,
  ResumeProcessingResult,
} from './resumeLauncherShared.js'
import { EXIT_EARLY } from './resumeLauncherShared.js'
import { handleRemoteOrTeleport } from './resumeLauncherTeleport.js'

export type { ResumeLikeLaunchOptions } from './resumeLauncherShared.js'

export async function runResumeLikeLaunch(
  options: ResumeLikeLaunchOptions,
): Promise<void> {
  const { clearSessionCaches } = await import('../../../commands/clear/caches.js')
  clearSessionCaches()

  let activeMainThreadAgentDefinition =
    options.resumeContext.mainThreadAgentDefinition
  let processedResume: ResumeProcessingResult

  const selection = await resolveResumeSelection(options)
  const remoteOrTeleportResult = await handleRemoteOrTeleport(options)
  if (remoteOrTeleportResult.exitEarly) {
    return
  }

  processedResume = await maybeLoadResumeFromFile(options, selection)
  if (processedResume === EXIT_EARLY) {
    return
  }
  if (processedResume?.restoredAgentDef) {
    activeMainThreadAgentDefinition = processedResume.restoredAgentDef
  }

  if (!processedResume && selection.maybeSessionId) {
    processedResume = await resumeBySessionId(
      options,
      selection.maybeSessionId,
      selection.matchedLog,
    )
    if (processedResume === EXIT_EARLY) {
      return
    }
    if (processedResume?.restoredAgentDef) {
      activeMainThreadAgentDefinition = processedResume.restoredAgentDef
    }
  }

  if (!(await waitForDownloadedFiles(options))) {
    return
  }

  const resumeData =
    processedResume ??
    buildResumeData(
      remoteOrTeleportResult.messages,
      activeMainThreadAgentDefinition,
      options.appProps.initialState,
    )

  if (resumeData) {
    options.startupModes.activateProactive()
    options.startupModes.activateBrief()
    await launchRepl(
      options.root,
      {
        ...options.appProps,
        initialState: resumeData.initialState,
      },
      {
        ...options.sessionConfig,
        mainThreadAgentDefinition:
          resumeData.restoredAgentDef ?? activeMainThreadAgentDefinition,
        initialMessages: resumeData.messages,
        initialFileHistorySnapshots: resumeData.fileHistorySnapshots,
        initialContentReplacements: resumeData.contentReplacements,
        initialAgentName: resumeData.agentName,
        initialAgentColor: resumeData.agentColor,
      },
      options.renderAndRun,
    )
    return
  }

  await launchResumeChooser(
    options.root,
    options.appProps,
    getWorktreePaths(options.currentCwd),
    {
      ...options.sessionConfig,
      initialSearchQuery: selection.searchTerm,
      forkSession: options.forkSession,
      filterByPr: selection.filterByPr,
    },
  )
}
