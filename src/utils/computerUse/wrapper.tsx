/**
 * The `.call()` override — thin adapter between `ToolUseContext` and
 * `bindSessionContext`. Spread into the MCP tool object in `client.ts`
 * (same pattern as Chrome's rendering overrides, plus `.call()`).
 *
 * The wrapper-closure logic (build overrides fresh, lock gate, permission
 * merge, screenshot stash) lives in `@ant/computer-use-mcp`'s
 * `bindSessionContext`. This file binds it once per process,
 * caches the dispatcher, and updates a per-call ref for the pieces of
 * `ToolUseContext` that vary per-call (`abortController`, `setToolJSX`,
 * `sendOSNotification`). AppState accessors are read through the ref too —
 * they're likely stable but we don't depend on that.
 *
 * External callers reach this via the lazy require thunk in `client.ts`, gated
 * on `feature('CHICAGO_MCP')`. Runtime enablement is controlled by the
 * GrowthBook gate `tengu_malort_pedway` (see gates.ts).
 */

import {
  bindSessionContext,
  type ComputerUseSessionContext,
  type CuCallToolResult,
  type CuPermissionRequest,
  type CuPermissionResponse,
  DEFAULT_GRANT_FLAGS,
  type ScreenshotDims,
} from '@ant/computer-use-mcp'
import * as React from 'react'
import { getSessionId } from '../../bootstrap/state.js'
import { ComputerUseApproval } from '../../components/permissions/ComputerUseApproval/ComputerUseApproval.js'
import type { Tool, ToolUseContext } from '../../Tool.js'
import { logForDebugging } from '../debug.js'
import { detectImageFormatFromBase64 } from '../imageResizer.js'
import {
  checkComputerUseLock,
  tryAcquireComputerUseLock,
} from './computerUseLock.js'
import { registerEscHotkey } from './escHotkey.js'
import { getChicagoCoordinateMode } from './gates.js'
import { getComputerUseHostAdapter } from './hostAdapter.js'
import { COMPUTER_USE_MCP_SERVER_NAME } from './common.js'
import { getComputerUseMCPRenderingOverrides } from './toolRendering.js'

type CallOverride = Pick<Tool, 'call'>['call']

type Binding = {
  ctx: ComputerUseSessionContext
  dispatch: (name: string, args: unknown) => Promise<CuCallToolResult>
}

type HeadlessPermissionPayload = {
  reason: string
  apps: Array<{
    requestedName: string
    bundleId?: string
    displayName?: string
    alreadyGranted: boolean
    sentinel: boolean
    status: 'resolved' | 'not_installed'
  }>
  requestedFlags: string[]
  willHide?: string[]
  autoUnhideEnabled?: boolean
  screenshotFiltering: CuPermissionRequest['screenshotFiltering']
  tccMissing?: string[]
}

const DENY_ALL_RESPONSE: CuPermissionResponse = {
  granted: [],
  denied: [],
  flags: DEFAULT_GRANT_FLAGS,
}

/**
 * Cached binding — built on first `.call()`, reused for process lifetime.
 * The dispatcher's closure-held screenshot blob persists across calls.
 *
 * `currentToolUseContext` is updated on every call. Every getter/callback in
 * `ctx` reads through it, so the per-call pieces (`abortController`,
 * `setToolJSX`, `sendOSNotification`) are always current.
 *
 * Module-level `let` is a deliberate exception to the no-module-scope-state
 * rule (src/CLAUDE.md): the dispatcher closure must persist across calls so
 * its internal screenshot blob survives, but `ToolUseContext` is per-call.
 * Tests will need to either inject the cache or run serially.
 */
let binding: Binding | undefined
let currentToolUseContext: ToolUseContext | undefined

export function resetComputerUseWrapperStateForTests(): void {
  binding = undefined
  currentToolUseContext = undefined
}

function tuc(): ToolUseContext {
  // Safe: `binding` is only populated when `currentToolUseContext` is set.
  // Called only from within `ctx` callbacks, which only fire during dispatch.
  return currentToolUseContext!
}

function formatLockHeld(holder: string): string {
  return `Computer use is in use by another Claude session (${holder.slice(0, 8)}…). Wait for that session to finish or run /exit there.`
}

export function buildSessionContext(): ComputerUseSessionContext {
  return {
    // ── Read state fresh via the per-call ref ─────────────────────────────
    getAllowedApps: () =>
      tuc().getAppState().computerUseMcpState?.allowedApps ?? [],
    getGrantFlags: () =>
      tuc().getAppState().computerUseMcpState?.grantFlags ??
      DEFAULT_GRANT_FLAGS,
    // cc-2 has no Settings page for user-denied apps yet.
    getUserDeniedBundleIds: () => [],
    getSelectedDisplayId: () =>
      tuc().getAppState().computerUseMcpState?.selectedDisplayId,
    getDisplayPinnedByModel: () =>
      tuc().getAppState().computerUseMcpState?.displayPinnedByModel ?? false,
    getDisplayResolvedForApps: () =>
      tuc().getAppState().computerUseMcpState?.displayResolvedForApps,
    getLastScreenshotDims: (): ScreenshotDims | undefined => {
      const d = tuc().getAppState().computerUseMcpState?.lastScreenshotDims
      return d
        ? {
            ...d,
            displayId: d.displayId ?? 0,
            originX: d.originX ?? 0,
            originY: d.originY ?? 0,
          }
        : undefined
    },

    // ── Write-backs ────────────────────────────────────────────────────────
    // Interactive sessions render the approval UI with `setToolJSX`.
    // Non-interactive sessions reuse the existing elicitation channel so
    // headless/SDK hosts can allow or deny the request without bespoke CU I/O.
    // The package's `_dialogSignal` (tool-finished dismissal) is irrelevant
    // here: our prompt lifetime is tied to the current tool call.
    onPermissionRequest: (req, _dialogSignal) => runPermissionDialog(req),

    // Package does the merge (dedupe + truthy-only flags). We just persist.
    onAllowedAppsChanged: (apps, flags) =>
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        const prevApps = cu?.allowedApps
        const prevFlags = cu?.grantFlags
        const sameApps =
          prevApps?.length === apps.length &&
          apps.every((a, i) => prevApps[i]?.bundleId === a.bundleId)
        const sameFlags =
          prevFlags?.clipboardRead === flags.clipboardRead &&
          prevFlags?.clipboardWrite === flags.clipboardWrite &&
          prevFlags?.systemKeyCombos === flags.systemKeyCombos
        return sameApps && sameFlags
          ? prev
          : {
              ...prev,
              computerUseMcpState: {
                ...cu,
                allowedApps: [...apps],
                grantFlags: flags,
              },
            }
      }),

    onAppsHidden: ids => {
      if (ids.length === 0) return
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        const existing = cu?.hiddenDuringTurn
        if (existing && ids.every(id => existing.has(id))) return prev
        return {
          ...prev,
          computerUseMcpState: {
            ...cu,
            hiddenDuringTurn: new Set([...(existing ?? []), ...ids]),
          },
        }
      })
    },

    // Resolver writeback only fires under a pin when Swift fell back to main
    // (pinned display unplugged) — the pin is semantically dead, so clear it
    // and the app-set key so the chase chain runs next time. When autoResolve
    // was true, onDisplayResolvedForApps re-sets the key in the same tick.
    onResolvedDisplayUpdated: id =>
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        if (
          cu?.selectedDisplayId === id &&
          !cu.displayPinnedByModel &&
          cu.displayResolvedForApps === undefined
        ) {
          return prev
        }
        return {
          ...prev,
          computerUseMcpState: {
            ...cu,
            selectedDisplayId: id,
            displayPinnedByModel: false,
            displayResolvedForApps: undefined,
          },
        }
      }),

    // switch_display(name) pins; switch_display("auto") unpins and clears the
    // app-set key so the next screenshot auto-resolves fresh.
    onDisplayPinned: id =>
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        const pinned = id !== undefined
        const nextResolvedFor = pinned ? cu?.displayResolvedForApps : undefined
        if (
          cu?.selectedDisplayId === id &&
          cu?.displayPinnedByModel === pinned &&
          cu?.displayResolvedForApps === nextResolvedFor
        ) {
          return prev
        }
        return {
          ...prev,
          computerUseMcpState: {
            ...cu,
            selectedDisplayId: id,
            displayPinnedByModel: pinned,
            displayResolvedForApps: nextResolvedFor,
          },
        }
      }),

    onDisplayResolvedForApps: key =>
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        if (cu?.displayResolvedForApps === key) return prev
        return {
          ...prev,
          computerUseMcpState: { ...cu, displayResolvedForApps: key },
        }
      }),

    onScreenshotCaptured: dims =>
      tuc().setAppState(prev => {
        const cu = prev.computerUseMcpState
        const p = cu?.lastScreenshotDims
        return p?.width === dims.width &&
          p?.height === dims.height &&
          p?.displayWidth === dims.displayWidth &&
          p?.displayHeight === dims.displayHeight &&
          p?.displayId === dims.displayId &&
          p?.originX === dims.originX &&
          p?.originY === dims.originY
          ? prev
          : {
              ...prev,
              computerUseMcpState: { ...cu, lastScreenshotDims: dims },
            }
      }),

    // ── Lock — async, direct file-lock calls ───────────────────────────────
    // No `lockHolderForGate` dance: the package's gate is async now. It
    // awaits `checkCuLock`, and on `holder: undefined` + non-deferring tool
    // awaits `acquireCuLock`. `defersLockAcquire` is the PACKAGE's set —
    // the local copy is gone.
    checkCuLock: async () => {
      const c = await checkComputerUseLock()
      switch (c.kind) {
        case 'free':
          return { holder: undefined, isSelf: false }
        case 'held_by_self':
          return { holder: getSessionId(), isSelf: true }
        case 'blocked':
          return { holder: c.by, isSelf: false }
      }
    },

    // Called only when checkCuLock returned `holder: undefined`. The O_EXCL
    // acquire is atomic — if another process grabbed it in the gap (rare),
    // throw so the tool fails instead of proceeding without the lock.
    // `fresh: false` (re-entrant) shouldn't happen given check said free,
    // but is possible under parallel tool-use interleaving — don't spam the
    // notification in that case.
    acquireCuLock: async () => {
      const r = await tryAcquireComputerUseLock()
      if (r.kind === 'blocked') {
        throw new Error(formatLockHeld(r.by))
      }
      if (r.fresh) {
        // Global Escape → abort. Consumes the event (PI defense — prompt
        // injection can't dismiss dialogs with Escape). The CGEventTap's
        // CFRunLoopSource is processed by the drainRunLoop pump, so this
        // holds a pump retain until unregisterEscHotkey() in cleanup.ts.
        const escRegistered = registerEscHotkey(() => {
          logForDebugging('[cu-esc] user escape, aborting turn')
          tuc().abortController.abort()
        })
        tuc().sendOSNotification?.({
          message: escRegistered
            ? 'Claude is using your computer · press Esc to stop'
            : 'Claude is using your computer · press Ctrl+C to stop',
          notificationType: 'computer_use_enter',
        })
      }
    },

    formatLockHeldMessage: formatLockHeld,
  }
}

function getOrBind(): Binding {
  if (binding) return binding
  const ctx = buildSessionContext()
  binding = {
    ctx,
    dispatch: bindSessionContext(
      getComputerUseHostAdapter(),
      getChicagoCoordinateMode(),
      ctx,
    ),
  }
  return binding
}

/**
 * Returns the full override object for a single `mcp__computer-use__{toolName}`
 * tool: rendering overrides from `toolRendering.tsx` plus a `.call()` that
 * dispatches through the cached binder.
 */
type ComputerUseMCPToolOverrides = ReturnType<
  typeof getComputerUseMCPRenderingOverrides
> & {
  call: CallOverride
}

export function getComputerUseMCPToolOverrides(
  toolName: string,
): ComputerUseMCPToolOverrides {
  const call: CallOverride = async (args, context: ToolUseContext) => {
    currentToolUseContext = context
    const { dispatch } = getOrBind()

    const { telemetry, ...result } = await dispatch(toolName, args)

    if (telemetry?.error_kind) {
      logForDebugging(
        `[Computer Use MCP] ${toolName} error_kind=${telemetry.error_kind}`,
      )
    }

    // MCP content blocks → Anthropic API blocks. CU only produces text and
    // pre-sized JPEG (executor.ts computeTargetDims → targetImageSize), so
    // unlike the generic MCP path there's no resize needed — the MCP image
    // shape just maps to the API's base64-source shape. The package's result
    // type admits audio/resource too, but CU's handleToolCall never emits
    // those; the fallthrough coerces them to empty text.
    const data = Array.isArray(result.content)
      ? result.content.map(item =>
          item.type === 'image'
            ? {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: item.mimeType ?? detectImageFormatFromBase64(item.data),
                  data: item.data,
                },
              }
            : {
                type: 'text' as const,
                text: item.type === 'text' ? item.text : '',
              },
        )
      : result.content
    return { data }
  }

  return {
    ...getComputerUseMCPRenderingOverrides(toolName),
    call,
  }
}

function buildHeadlessPermissionPayload(
  req: CuPermissionRequest,
): HeadlessPermissionPayload {
  const requestedFlags = Object.entries(req.requestedFlags)
    .filter(([, enabled]) => enabled)
    .map(([flag]) => flag)
  const tccMissing = req.tccState
    ? [
        !req.tccState.accessibility ? 'Accessibility' : null,
        !req.tccState.screenRecording ? 'Screen Recording' : null,
      ].filter((value): value is string => value !== null)
    : undefined

  return {
    reason: req.reason,
    apps: req.apps.map(app => ({
      requestedName: app.requestedName,
      bundleId: app.resolved?.bundleId,
      displayName: app.resolved?.displayName,
      alreadyGranted: app.alreadyGranted,
      sentinel: app.isSentinel,
      status: app.resolved ? 'resolved' : 'not_installed',
    })),
    requestedFlags,
    willHide: req.willHide?.map(app => app.displayName),
    autoUnhideEnabled: req.autoUnhideEnabled,
    screenshotFiltering: req.screenshotFiltering,
    ...(tccMissing && tccMissing.length > 0 ? { tccMissing } : {}),
  }
}

function buildHeadlessPermissionMessage(req: CuPermissionRequest): string {
  const payload = buildHeadlessPermissionPayload(req)
  const lines = [
    'Allow Claude to use computer-use for this request?',
    `Reason: ${payload.reason}`,
  ]

  if (payload.tccMissing && payload.tccMissing.length > 0) {
    lines.push(
      `Missing macOS permissions: ${payload.tccMissing.join(', ')}`,
      'Grant them in System Settings, then retry request_access.',
    )
  }

  if (payload.apps.length > 0) {
    lines.push('Requested apps:')
    for (const app of payload.apps) {
      const name = app.displayName ?? app.bundleId ?? app.requestedName
      const details = [
        app.status === 'not_installed' ? 'not installed' : null,
        app.alreadyGranted ? 'already granted' : null,
        app.sentinel ? 'sentinel app' : null,
      ].filter(Boolean)
      lines.push(
        `- ${name}${details.length > 0 ? ` (${details.join(', ')})` : ''}`,
      )
    }
  }

  if (payload.requestedFlags.length > 0) {
    lines.push(`Requested flags: ${payload.requestedFlags.join(', ')}`)
  }

  if (payload.willHide && payload.willHide.length > 0) {
    lines.push(
      `${payload.autoUnhideEnabled ? 'Apps hidden during the turn and restored after:' : 'Apps hidden during the turn:'} ${payload.willHide.join(', ')}`,
    )
  }

  if (payload.screenshotFiltering === 'none') {
    lines.push(
      'Warning: screenshots are not filtered on this platform and may include other visible apps.',
    )
  }

  return lines.join('\n')
}

async function runHeadlessPermissionDialog(
  context: ToolUseContext,
  req: CuPermissionRequest,
): Promise<CuPermissionResponse> {
  if (req.tccState) {
    return DENY_ALL_RESPONSE
  }

  const handleElicitation = context.handleElicitation
  if (!handleElicitation) {
    return DENY_ALL_RESPONSE
  }

  const result = await handleElicitation(
    COMPUTER_USE_MCP_SERVER_NAME,
    {
      message: buildHeadlessPermissionMessage(req),
      mode: 'form',
      requestedSchema: {
        type: 'object',
        properties: {},
      },
    },
    context.abortController.signal,
  )

  if (result.action !== 'accept') {
    return DENY_ALL_RESPONSE
  }

  return {
    granted: req.apps
      .filter(app => app.resolved && !app.alreadyGranted)
      .map(app => ({
        bundleId: app.resolved!.bundleId,
        displayName: app.resolved!.displayName,
        grantedAt: Date.now(),
        tier: app.proposedTier,
      })),
    denied: req.apps
      .filter(app => !app.resolved)
      .map(app => ({
        bundleId: app.requestedName,
        reason: 'not_installed' as const,
      })),
    flags: {
      ...DEFAULT_GRANT_FLAGS,
      ...req.requestedFlags,
    },
  }
}

/**
 * Render the approval dialog mid-call via `setToolJSX` + `Promise`, wait for
 * the user in interactive sessions, or reuse the existing elicitation pipeline
 * in headless sessions.
 *
 * The merge-into-AppState that used to live here (dedupe + truthy-only flags)
 * is now in the package's `bindSessionContext` → `onAllowedAppsChanged`.
 */
async function runPermissionDialog(
  req: CuPermissionRequest,
): Promise<CuPermissionResponse> {
  const context = tuc()
  const setToolJSX = context.setToolJSX
  if (context.options.isNonInteractiveSession || !setToolJSX) {
    return runHeadlessPermissionDialog(context, req)
  }

  try {
    return await new Promise<CuPermissionResponse>((resolve, reject) => {
      const signal = context.abortController.signal
      // If already aborted, addEventListener won't fire — reject now so the
      // promise doesn't hang waiting for a user who Ctrl+C'd.
      if (signal.aborted) {
        reject(new Error('Computer Use permission dialog aborted'))
        return
      }
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort)
        reject(new Error('Computer Use permission dialog aborted'))
      }
      signal.addEventListener('abort', onAbort)

      setToolJSX({
        jsx: React.createElement(ComputerUseApproval, {
          request: req,
          onDone: (resp: CuPermissionResponse) => {
            signal.removeEventListener('abort', onAbort)
            resolve(resp)
          },
        }),
        shouldHidePromptInput: true,
      })
    })
  } finally {
    setToolJSX(null)
  }
}
