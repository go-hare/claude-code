import { mkdir, readFile, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type {
  RuntimeSessionIndex,
  RuntimeSessionIndexEntry,
  RuntimeSessionIndexStore,
} from '../../contracts/session.js'

export type ServerSessionIndexStore = RuntimeSessionIndexStore

function isFsInaccessible(error: unknown): boolean {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : ''
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function getDefaultServerSessionIndexPath(): string {
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  return join(configDir, 'server-sessions.json')
}

export function createServerSessionIndexStore(
  path = getDefaultServerSessionIndexPath(),
): ServerSessionIndexStore {
  async function load(): Promise<RuntimeSessionIndex> {
    try {
      const raw = await readFile(path, 'utf8')
      const parsed = JSON.parse(raw) as RuntimeSessionIndex
      return parsed ?? {}
    } catch (error) {
      if (isFsInaccessible(error)) {
        return {}
      }
      throw error
    }
  }

  async function write(index: RuntimeSessionIndex): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(index, null, 2))
  }

  return {
    load,
    async list() {
      return Object.entries(await load())
    },
    async upsert(key, entry) {
      const index = await load()
      index[key] = entry
      await write(index)
    },
    async remove(key) {
      const index = await load()
      if (!(key in index)) {
        return
      }
      delete index[key]
      await write(index)
    },
  }
}
