import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const slashCommandContent = readFileSync(
  join(import.meta.dir, '../processUserInput/processSlashCommand.tsx'),
  'utf8',
)
const processUserInputContent = readFileSync(
  join(import.meta.dir, '../processUserInput/processUserInput.ts'),
  'utf8',
)
const handlePromptSubmitContent = readFileSync(
  join(import.meta.dir, '../handlePromptSubmit.ts'),
  'utf8',
)

describe('background slash-command autonomy deferral contracts', () => {
  test('keeps queued autonomy deferred until the background fork finishes', () => {
    expect(slashCommandContent).toContain(
      "queuedAutonomy?: QueuedCommand['autonomy']",
    )
    expect(slashCommandContent).toContain(
      ').queuedAutonomy = queuedAutonomy',
    )
    expect(slashCommandContent).toContain(
      'deferAutonomyCompletion: Boolean(autonomy?.runId),',
    )
    expect(slashCommandContent).toContain(
      'await finalizeDeferredAutonomyRunCompleted()',
    )
    expect(slashCommandContent).toContain(
      'await finalizeDeferredAutonomyRunFailed(err)',
    )

    const enqueueResultIndex = slashCommandContent.indexOf(
      '`<scheduled-task-result command="/${commandName}">\\n${resultText}\\n</scheduled-task-result>`',
    )
    const finalizeCompletedIndex = slashCommandContent.indexOf(
      'await finalizeDeferredAutonomyRunCompleted()',
    )
    expect(enqueueResultIndex).toBeGreaterThan(-1)
    expect(finalizeCompletedIndex).toBeGreaterThan(enqueueResultIndex)

    expect(processUserInputContent).toContain(
      "autonomy?: QueuedCommand['autonomy']",
    )
    expect(processUserInputContent).toContain('autonomy,')

    expect(handlePromptSubmitContent).toContain(
      'const deferredAutonomyRunIds = new Set<string>()',
    )
    expect(handlePromptSubmitContent).toContain(
      'if (runId && result.deferAutonomyCompletion)',
    )
    expect(handlePromptSubmitContent).toContain(
      '!runId || !deferredAutonomyRunIds.has(runId)',
    )
  })
})
