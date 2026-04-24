import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const bootstrapContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessBootstrap.ts',
  ),
  'utf8',
)
const loopContent = readFileSync(
  join(
    process.cwd(),
    'src/runtime/capabilities/execution/internal/headlessRuntimeLoop.ts',
  ),
  'utf8',
)

describe('headless bootstrap ownership', () => {
  test('loadInitialMessages returns loaded conversation data instead of adopting it directly', () => {
    expect(bootstrapContent).toContain('loadedConversation?:')
    expect(bootstrapContent).toContain('externalMetadata?:')
    expect(bootstrapContent).toContain('initialUserMessage?:')
    expect(bootstrapContent).not.toContain(
      'session.bootstrap.applyLoadedConversation(',
    )
    expect(bootstrapContent).not.toContain(
      'session.bootstrap.applyExternalMetadata(',
    )
    expect(bootstrapContent).not.toContain('matchSessionMode(')
    expect(bootstrapContent).not.toContain('saveMode(')
    expect(bootstrapContent).toContain(
      'initialUserMessage: takeInitialUserMessage()',
    )
  })

  test('headless runtime loop adopts loaded conversations through the session bootstrap seam', () => {
    expect(loopContent).toContain('session.bootstrap.applyExternalMetadata(')
    expect(loopContent).toContain('session.bootstrap.applyLoadedConversation(')
    expect(loopContent).toContain('session.bootstrap.applyLoadedConversationMode(')
    expect(loopContent).toContain('session.bootstrap.persistAgentSetting(')
    expect(loopContent).toContain('session.bootstrap.applyModelChange(')
    expect(loopContent).toContain('session.bootstrap.persistGeneratedTitle(')
    expect(loopContent).toContain('initialUserMessage,')
    expect(loopContent).not.toContain('takeInitialUserMessage()')
    expect(loopContent).not.toContain('saveAgentSetting(')
    expect(loopContent).not.toContain('saveAiGeneratedTitle(')
    expect(loopContent).not.toContain('notifySessionMetadataChanged({ model')
  })
})
