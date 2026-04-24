import type { Root } from '@anthropic/ink'
import type { DownloadResult } from '../../../services/api/filesApi.js'
import type { LogOption } from '../../../types/logs.js'
import { processResumedConversation, type ProcessedResume } from '../../../utils/sessionRestore.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchReplProps,
  CliLaunchSessionConfig,
} from './sharedLaunchContext.js'

export type ReplProps = CliLaunchReplProps

export type ResumeLikeLaunchOptions = {
  root: Root
  appProps: CliLaunchAppProps
  replProps: ReplProps
  sessionConfig: CliLaunchSessionConfig
  renderAndRun: CliLaunchRenderAndRun
  resume?: string | boolean
  fromPr?: boolean | string
  forkSession?: boolean
  remote: string | boolean | null
  teleport?: boolean | string | null
  currentCwd: string
  fileDownloadPromise?: Promise<DownloadResult[]>
  resumeContext: Parameters<typeof processResumedConversation>[2]
  stateWriter: {
    enableRemoteMode(sessionId: string): void
    setCwd(path: string): void
    setOriginalCwd(path: string): void
    markTeleportedSession(sessionId: string): void
  }
  startupModes: {
    activateProactive(): void
    activateBrief(): void
  }
  runtime: {
    shutdown(code: number): Promise<void>
    exit(code: number): void
    writeStdout(message: string): void
    writeStderr(message: string): void
  }
}

export type ResumeSelection = {
  maybeSessionId: string | null
  searchTerm?: string
  matchedLog: LogOption | null
  filterByPr?: boolean | number | string
}

export const EXIT_EARLY = Symbol('resume-launch-exit-early')

export type ResumeProcessingResult =
  | ProcessedResume
  | typeof EXIT_EARLY
  | undefined
