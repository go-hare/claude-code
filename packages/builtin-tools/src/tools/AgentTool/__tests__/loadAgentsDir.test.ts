import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadMarkdownFilesForSubdir } from 'src/utils/markdownConfigLoader.js'
import {
  clearAgentDefinitionsCache,
} from '../loadAgentsDir.js'

describe('clearAgentDefinitionsCache', () => {
  const originalNativeSearch = process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
  let tempRoot = ''
  let agentType = ''

  function writeAgent(description: string, prompt: string): void {
    writeFileSync(
      join(tempRoot, '.claude', 'agents', `${agentType}.md`),
      `---\nname: ${agentType}\ndescription: ${description}\n---\n${prompt}\n`,
      'utf8',
    )
  }

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'agent-def-cache-'))
    agentType = `cache-test-agent-${Date.now()}`
    mkdirSync(join(tempRoot, '.claude', 'agents'), { recursive: true })
    process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = '1'
    clearAgentDefinitionsCache()
  })

  afterEach(() => {
    clearAgentDefinitionsCache()
    if (originalNativeSearch === undefined) {
      delete process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH
    } else {
      process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH = originalNativeSearch
    }
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  test('clears the underlying markdown cache for project agents', async () => {
    writeAgent('first description', 'prompt one')

    const first = await loadMarkdownFilesForSubdir('agents', tempRoot)
    const firstAgent = first.find(file => file.frontmatter.name === agentType)

    expect(firstAgent?.frontmatter.description).toBe('first description')
    expect(firstAgent?.content.trim()).toBe('prompt one')

    writeAgent('second description', 'prompt two')
    clearAgentDefinitionsCache()

    const second = await loadMarkdownFilesForSubdir('agents', tempRoot)
    const secondAgent = second.find(file => file.frontmatter.name === agentType)

    expect(secondAgent?.frontmatter.description).toBe('second description')
    expect(secondAgent?.content.trim()).toBe('prompt two')
  })
})
