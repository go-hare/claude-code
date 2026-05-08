import { runWithCwdOverride } from '../utils/cwd.js'
import {
  createKernelMemoryManager,
  type KernelMemoryDescriptor,
  type KernelMemoryDocument,
  type KernelMemoryManager,
} from './memory.js'

export type MemoryCoreServiceOptions = {
  workspacePath?: string
  memoryManager?: KernelMemoryManager
}

export class MemoryCoreService {
  private readonly memoryManager: KernelMemoryManager

  constructor(private readonly options: MemoryCoreServiceOptions = {}) {
    this.memoryManager =
      options.memoryManager ?? createKernelMemoryManager()
  }

  listMemory(context?: {
    cwd?: string
  }): Promise<{ memories: readonly KernelMemoryDescriptor[] }> {
    return this.withCwd(context?.cwd, async () => ({
      memories: await this.memoryManager.list(),
    }))
  }

  readMemory(
    id: string,
    context?: { cwd?: string },
  ): Promise<{ memory: KernelMemoryDocument }> {
    return this.withCwd(context?.cwd, async () => ({
      memory: await this.memoryManager.read(id),
    }))
  }

  updateMemory(
    request: { id: string; content: string },
    context?: { cwd?: string },
  ): Promise<{ memory: KernelMemoryDocument }> {
    return this.withCwd(context?.cwd, async () => ({
      memory: await this.memoryManager.update(request),
    }))
  }

  private withCwd<T>(cwd: string | undefined, fn: () => Promise<T>): Promise<T> {
    const effectiveCwd = cwd ?? this.options.workspacePath
    return effectiveCwd ? runWithCwdOverride(effectiveCwd, fn) : fn()
  }
}
