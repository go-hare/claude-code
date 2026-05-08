import { runWithCwdOverride } from '../utils/cwd.js'
import {
  createKernelContextManager,
  type KernelContextManager,
  type KernelContextSnapshot,
} from './context.js'

export type ContextCoreServiceOptions = {
  workspacePath?: string
  contextManager?: KernelContextManager
}

export class ContextCoreService {
  private readonly contextManager: KernelContextManager

  constructor(private readonly options: ContextCoreServiceOptions = {}) {
    this.contextManager =
      options.contextManager ?? createKernelContextManager()
  }

  readContext(context?: {
    cwd?: string
  }): Promise<KernelContextSnapshot> {
    return this.withCwd(context?.cwd, () => this.contextManager.read())
  }

  getGitStatus(context?: { cwd?: string }): Promise<string | null> {
    return this.withCwd(context?.cwd, () => this.contextManager.getGitStatus())
  }

  getSystemPromptInjection(context?: { cwd?: string }): Promise<string | null> {
    return this.withCwd(context?.cwd, () =>
      Promise.resolve(this.contextManager.getSystemPromptInjection()),
    )
  }

  setSystemPromptInjection(
    value: string | null,
    context?: { cwd?: string },
  ): Promise<string | null> {
    return this.withCwd(context?.cwd, () => {
      this.contextManager.setSystemPromptInjection(value)
      return Promise.resolve(this.contextManager.getSystemPromptInjection())
    })
  }

  private withCwd<T>(cwd: string | undefined, fn: () => Promise<T>): Promise<T> {
    const effectiveCwd = cwd ?? this.options.workspacePath
    return effectiveCwd ? runWithCwdOverride(effectiveCwd, fn) : fn()
  }
}
