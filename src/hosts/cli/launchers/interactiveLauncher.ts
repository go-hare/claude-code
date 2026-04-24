import { logEvent } from '../../../services/analytics/index.js'
import { launchRepl } from '../../../replLauncher.js'
import { createSystemMessage } from '../../../utils/messages.js'
import { buildDeepLinkBanner } from '../../../utils/deepLink/banner.js'
import type {
  CliLaunchAppProps,
  CliLaunchRenderAndRun,
  CliLaunchRoot,
  CliLaunchSessionConfig,
} from './sharedLaunchContext.js'

export type InteractiveLaunchOptions = {
  root: CliLaunchRoot
  appProps: CliLaunchAppProps
  sessionConfig: CliLaunchSessionConfig
  renderAndRun: CliLaunchRenderAndRun
  hookMessages: NonNullable<Parameters<typeof launchRepl>[2]['initialMessages']>
  hooksPromise?:
    | Promise<NonNullable<Parameters<typeof launchRepl>[2]['initialMessages']>>
    | null
  pendingStartupMessages?: Parameters<typeof launchRepl>[2]['pendingStartupMessages']
  startupModes: {
    activateProactive(): void
    activateBrief(): void
  }
  profileCheckpoint(checkpoint: string): void
  features: {
    coordinatorMode: boolean
    lodestone: boolean
  }
  coordinatorMode: 'coordinator' | 'normal'
  saveMode(mode: 'coordinator' | 'normal'): void
  deepLink: {
    origin?: string | boolean
    repo?: string
    lastFetch?: number
    prefill?: string
  }
  cwd: string
}

export async function runInteractiveLaunch(
  options: InteractiveLaunchOptions,
): Promise<void> {
  const pendingHookMessages =
    options.hooksPromise && options.hookMessages.length === 0
      ? options.hooksPromise
      : undefined

  options.profileCheckpoint('action_after_hooks')
  options.startupModes.activateProactive()
  options.startupModes.activateBrief()

  if (options.features.coordinatorMode) {
    options.saveMode(options.coordinatorMode)
  }

  let deepLinkBanner: ReturnType<typeof createSystemMessage> | null = null
  if (options.features.lodestone) {
    if (options.deepLink.origin) {
      logEvent('tengu_deep_link_opened', {
        has_prefill: Boolean(options.deepLink.prefill),
        has_repo: Boolean(options.deepLink.repo),
      })
      deepLinkBanner = createSystemMessage(
        buildDeepLinkBanner({
          cwd: options.cwd,
          prefillLength: options.deepLink.prefill?.length,
          repo: options.deepLink.repo,
          lastFetch:
            options.deepLink.lastFetch !== undefined
              ? new Date(options.deepLink.lastFetch)
              : undefined,
        }),
        'warning',
      )
    } else if (options.deepLink.prefill) {
      deepLinkBanner = createSystemMessage(
        'Launched with a pre-filled prompt — review it before pressing Enter.',
        'warning',
      )
    }
  }

  const initialMessages = deepLinkBanner
    ? [deepLinkBanner, ...options.hookMessages]
    : options.hookMessages.length > 0
      ? options.hookMessages
      : undefined

  await launchRepl(
    options.root,
    options.appProps,
    {
      ...options.sessionConfig,
      initialMessages,
      pendingStartupMessages: options.pendingStartupMessages,
      pendingHookMessages,
    },
    options.renderAndRun,
  )
}
