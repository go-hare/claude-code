import { realpathSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'

export type FileLockEntry = {
  key: string
  path: string
  agentId: string
  sourceTool?: string
  acquiredAt: number
}

export type FileLockAcquireMetadata = {
  sourceTool?: string
}

export type FileLockAcquireResult =
  | {
      success: true
      key: string
      entry: Readonly<FileLockEntry>
    }
  | {
      success: false
      key: string
      conflict: Readonly<FileLockEntry>
      conflictAgeMs: number
    }

export type FileLockStats = {
  activeLocks: number
  totalAcquisitions: number
  totalConflicts: number
  totalTransfers: number
  lastConflictAt?: number
}

const fileLocks = new Map<string, FileLockEntry>()
const fileLockStats: FileLockStats = {
  activeLocks: 0,
  totalAcquisitions: 0,
  totalConflicts: 0,
  totalTransfers: 0,
}

function normalizeCanonicalPath(filePath: string): string {
  const slashNormalized = filePath.replace(/\\/g, '/')
  return process.platform === 'win32'
    ? slashNormalized.toLowerCase()
    : slashNormalized
}

function canonicalizeExistingPath(filePath: string): string {
  return normalizeCanonicalPath(realpathSync(filePath))
}

function canonicalizeMissingPath(filePath: string): string {
  const absolutePath = resolve(filePath)
  const parentDir = dirname(absolutePath)
  const name = basename(absolutePath)

  try {
    return normalizeCanonicalPath(join(realpathSync(parentDir), name))
  } catch {
    return normalizeCanonicalPath(absolutePath)
  }
}

export function canonicalizeFileLockPath(filePath: string): string {
  try {
    return canonicalizeExistingPath(filePath)
  } catch {
    return canonicalizeMissingPath(filePath)
  }
}

function refreshStats(): void {
  fileLockStats.activeLocks = fileLocks.size
}

export function acquireFileLock(
  filePath: string,
  agentId: string,
  metadata: FileLockAcquireMetadata = {},
): FileLockAcquireResult {
  const key = canonicalizeFileLockPath(filePath)
  const existing = fileLocks.get(key)

  if (existing === undefined) {
    const entry: FileLockEntry = {
      key,
      path: resolve(filePath),
      agentId,
      sourceTool: metadata.sourceTool,
      acquiredAt: Date.now(),
    }
    fileLocks.set(key, entry)
    fileLockStats.totalAcquisitions += 1
    refreshStats()
    return { success: true, key, entry }
  }

  if (existing.agentId === agentId) {
    return { success: true, key, entry: existing }
  }

  fileLockStats.totalConflicts += 1
  fileLockStats.lastConflictAt = Date.now()
  refreshStats()

  return {
    success: false,
    key,
    conflict: existing,
    conflictAgeMs: Math.max(0, Date.now() - existing.acquiredAt),
  }
}

export function releaseAgentLocks(agentId: string): number {
  let released = 0

  for (const [key, entry] of fileLocks.entries()) {
    if (entry.agentId === agentId) {
      fileLocks.delete(key)
      released += 1
    }
  }

  refreshStats()
  return released
}

export function transferAgentLocks(fromAgentId: string, toAgentId: string): number {
  if (fromAgentId === toAgentId) {
    return 0
  }

  let transferred = 0

  for (const entry of fileLocks.values()) {
    if (entry.agentId === fromAgentId) {
      entry.agentId = toAgentId
      transferred += 1
    }
  }

  if (transferred > 0) {
    fileLockStats.totalTransfers += transferred
  }

  refreshStats()
  return transferred
}

export function getFileLockOwner(filePath: string): string | null {
  const key = canonicalizeFileLockPath(filePath)
  return fileLocks.get(key)?.agentId ?? null
}

export function getAllLocks(): ReadonlyMap<string, Readonly<FileLockEntry>> {
  return new Map(fileLocks)
}

export function getFileLockStats(): Readonly<FileLockStats> {
  return {
    ...fileLockStats,
    activeLocks: fileLocks.size,
  }
}

export function clearAllLocks(): void {
  fileLocks.clear()
  fileLockStats.activeLocks = 0
}

export function resetFileLockStateForTests(): void {
  fileLocks.clear()
  fileLockStats.activeLocks = 0
  fileLockStats.totalAcquisitions = 0
  fileLockStats.totalConflicts = 0
  fileLockStats.totalTransfers = 0
  delete fileLockStats.lastConflictAt
}
