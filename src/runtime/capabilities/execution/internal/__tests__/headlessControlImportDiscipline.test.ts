import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const headlessControlContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessControl.ts',
  ),
  'utf8',
)
const headlessSessionControlContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessSessionControl.ts',
  ),
  'utf8',
)

describe('headless control import discipline', () => {
  test('headlessControl does not import bootstrap state directly for headless control state', () => {
    expect(headlessControlContent).not.toContain(
      "from 'src/bootstrap/state.js'",
    )
    expect(headlessControlContent).not.toContain('getMainThreadAgentType,')
    expect(headlessControlContent).not.toContain('setMainThreadAgentType,')
    expect(headlessControlContent).not.toContain('setInitJsonSchema,')
    expect(headlessControlContent).not.toContain('setMainLoopModelOverride,')
    expect(headlessControlContent).not.toContain('getSessionId,')
    expect(headlessControlContent).not.toContain('registerHookCallbacks,')
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.getHeadlessControlState()',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.patchHeadlessControlState({',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.patchPromptState({',
    )
    expect(headlessControlContent).toContain(
      'bootstrapStateProvider.registerHookCallbacks(hooks)',
    )
  })

  test('headlessSessionControl reads allowed channels through the runtime provider seam', () => {
    expect(headlessSessionControlContent).not.toContain(
      "from 'src/bootstrap/state.js'",
    )
    expect(headlessSessionControlContent).toContain(
      'bootstrapStateProvider.getHeadlessControlState().allowedChannels',
    )
    expect(headlessSessionControlContent).toContain(
      'bootstrapStateProvider.patchHeadlessControlState({',
    )
  })
})
