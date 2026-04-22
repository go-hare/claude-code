import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanupTempDir, createTempDir, writeTempFile } from '../../../../tests/mocks/file-system'
import {
  getAdditionalDirectoriesForClaudeMd,
  setAdditionalDirectoriesForClaudeMd,
} from '../../../bootstrap/state.js'
import {
  getAddDirEnabledPlugins,
  getAddDirExtraMarketplaces,
} from '../addDirPluginSettings.js'

let tempDirA = ''
let tempDirB = ''
let originalProjectConfigDirName: string | undefined
let originalAdditionalDirectories: string[]

beforeEach(async () => {
  tempDirA = await createTempDir('add-dir-settings-a-')
  tempDirB = await createTempDir('add-dir-settings-b-')
  originalProjectConfigDirName = process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  originalAdditionalDirectories = [...getAdditionalDirectoriesForClaudeMd()]
  setAdditionalDirectoriesForClaudeMd([])
  delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
})

afterEach(async () => {
  setAdditionalDirectoriesForClaudeMd(originalAdditionalDirectories)
  if (originalProjectConfigDirName === undefined) {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
  } else {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = originalProjectConfigDirName
  }
  await cleanupTempDir(tempDirA)
  await cleanupTempDir(tempDirB)
})

describe('addDirPluginSettings', () => {
  test('reads enabled plugins from the configured project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'
    setAdditionalDirectoriesForClaudeMd([tempDirA, tempDirB])

    await writeTempFile(
      tempDirA,
      '.hare/settings.json',
      JSON.stringify({
        enabledPlugins: {
          alpha: true,
          shared: false,
        },
      }),
    )
    await writeTempFile(
      tempDirA,
      '.hare/settings.local.json',
      JSON.stringify({
        enabledPlugins: {
          shared: true,
        },
      }),
    )
    await writeTempFile(
      tempDirB,
      '.hare/settings.json',
      JSON.stringify({
        enabledPlugins: {
          beta: true,
          shared: false,
        },
      }),
    )

    expect(getAddDirEnabledPlugins()).toEqual({
      alpha: true,
      beta: true,
      shared: false,
    })
  })

  test('reads extra marketplaces from the configured project config dir', async () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = '.hare'
    setAdditionalDirectoriesForClaudeMd([tempDirA, tempDirB])

    await writeTempFile(
      tempDirA,
      '.hare/settings.json',
      JSON.stringify({
        extraKnownMarketplaces: {
          local: {
            source: {
              source: 'url',
              url: 'https://example.com/local-marketplace.json',
            },
          },
        },
      }),
    )
    await writeTempFile(
      tempDirB,
      '.hare/settings.local.json',
      JSON.stringify({
        extraKnownMarketplaces: {
          local: {
            source: {
              source: 'url',
              url: 'https://example.com/override-marketplace.json',
            },
            autoUpdate: true,
          },
          team: {
            source: {
              source: 'github',
              repo: 'example/team-marketplace',
            },
          },
        },
      }),
    )

    expect(getAddDirExtraMarketplaces()).toEqual({
      local: {
        source: {
          source: 'url',
          url: 'https://example.com/override-marketplace.json',
        },
        autoUpdate: true,
      },
      team: {
        source: {
          source: 'github',
          repo: 'example/team-marketplace',
        },
      },
    })
  })
})
