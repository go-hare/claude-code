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
  }): Promise<{
    memories: readonly KernelMemoryDescriptor[]
    descriptors: readonly KernelMemoryDescriptor[]
  }> {
    return this.withCwd(context?.cwd, async () => {
      const memories = await this.memoryManager.list()
      return {
        memories,
        descriptors: memories,
      }
    })
  }

  readMemory(
    id: string,
    context?: { cwd?: string },
  ): Promise<{ memory: KernelMemoryDocument; document: KernelMemoryDocument }> {
    return this.withCwd(context?.cwd, async () => {
      const memory = await this.memoryManager.read(id)
      return {
        memory,
        document: memory,
      }
    })
  }

  updateMemory(
    request: { id: string; content: string },
    context?: { cwd?: string },
  ): Promise<{ memory: KernelMemoryDocument; document: KernelMemoryDocument }> {
    return this.withCwd(context?.cwd, async () => {
      const memory = await this.memoryManager.update(request)
      return {
        memory,
        document: memory,
      }
    })
  }

  private withCwd<T>(cwd: string | undefined, fn: () => Promise<T>): Promise<T> {
    const effectiveCwd = cwd ?? this.options.workspacePath
    return effectiveCwd ? runWithCwdOverride(effectiveCwd, fn) : fn()
  }
}
