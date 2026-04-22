import memoize from 'lodash-es/memoize.js'
import { homedir } from 'os'
import { join, relative, sep } from 'path'

export const DEFAULT_PROJECT_CONFIG_DIR_NAME = '.claude'

// Memoized: 150+ callers, many on hot paths. Keyed off CLAUDE_CONFIG_DIR so
// tests that change the env var get a fresh value without explicit cache.clear.
export const getUserConfigHomeDir = memoize(
  (): string => {
    return (
      process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), DEFAULT_PROJECT_CONFIG_DIR_NAME)
    ).normalize('NFC')
  },
  () => process.env.CLAUDE_CONFIG_DIR,
)

function validateProjectConfigDirName(rawValue: string): string {
  const normalizedValue = rawValue.trim().normalize('NFC')
  if (!normalizedValue) {
    throw new Error('CLAUDE_PROJECT_CONFIG_DIR_NAME must not be empty')
  }
  if (normalizedValue === '.' || normalizedValue === '..') {
    throw new Error(
      'CLAUDE_PROJECT_CONFIG_DIR_NAME must be a directory name, not "." or ".."',
    )
  }
  if (normalizedValue.includes('/') || normalizedValue.includes('\\')) {
    throw new Error(
      'CLAUDE_PROJECT_CONFIG_DIR_NAME must not contain path separators',
    )
  }
  return normalizedValue
}

export const getProjectConfigDirName = memoize(
  (): string => {
    const configuredValue = process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME
    if (!configuredValue) {
      return DEFAULT_PROJECT_CONFIG_DIR_NAME
    }
    return validateProjectConfigDirName(configuredValue)
  },
  () => process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME,
)

export function getProjectConfigDir(cwd: string): string {
  return join(cwd, getProjectConfigDirName())
}

export function joinProjectConfigPath(cwd: string, ...parts: string[]): string {
  return join(getProjectConfigDir(cwd), ...parts)
}

function toDisplayPath(path: string): string {
  return path.split(sep).join('/')
}

export function getUserConfigHomeDisplayPath(): string {
  const configHome = getUserConfigHomeDir()
  const home = homedir().normalize('NFC')
  const relativeToHome = relative(home, configHome)
  if (
    relativeToHome &&
    relativeToHome !== '.' &&
    !relativeToHome.startsWith('..') &&
    !relativeToHome.includes(':')
  ) {
    return toDisplayPath(`~/${relativeToHome}`)
  }
  if (configHome === home) {
    return '~'
  }
  return toDisplayPath(configHome)
}

export function joinUserConfigDisplayPath(...parts: string[]): string {
  return toDisplayPath(join(getUserConfigHomeDisplayPath(), ...parts))
}

export function getProjectConfigDirDisplayPath(...parts: string[]): string {
  return toDisplayPath(join(getProjectConfigDirName(), ...parts))
}
