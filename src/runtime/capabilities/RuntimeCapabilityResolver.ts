import type {
  KernelCapabilityDescriptor,
  KernelCapabilityError,
  KernelCapabilityName,
  KernelCapabilityReloadScope,
  KernelCapabilityStatus,
  KernelCapabilityUnavailableCode,
} from '../contracts/capability.js'

export type RuntimeCapabilityLoadContext = {
  cwd?: string
  metadata?: Record<string, unknown>
}

export type RuntimeCapabilityLoadResult = unknown

export type RuntimeCapabilityLoader = (
  context: RuntimeCapabilityLoadContext,
) => Promise<RuntimeCapabilityLoadResult>

export type RuntimeCapabilityEnabled =
  | boolean
  | ((context: RuntimeCapabilityLoadContext) => boolean)

export type RuntimeCapabilityDegradedPolicy =
  | boolean
  | ((
      error: unknown,
      context: RuntimeCapabilityLoadContext,
    ) => boolean)

export type RuntimeCapabilityDefinition = {
  name: KernelCapabilityName
  lazy?: boolean
  dependencies?: readonly KernelCapabilityName[]
  reloadable?: boolean
  enabled?: RuntimeCapabilityEnabled
  degradeOnFailure?: RuntimeCapabilityDegradedPolicy
  metadata?: Record<string, unknown>
  load?: RuntimeCapabilityLoader
}

type RuntimeCapabilityEntry = {
  definition: RuntimeCapabilityDefinition
  descriptor: KernelCapabilityDescriptor
  value?: RuntimeCapabilityLoadResult
  loading?: Promise<RuntimeCapabilityLoadResult>
}

export class RuntimeCapabilityUnavailableError extends Error {
  constructor(
    readonly code: KernelCapabilityUnavailableCode,
    readonly capabilityName: KernelCapabilityName,
    message?: string,
  ) {
    super(message ?? `Capability ${capabilityName} is unavailable`)
    this.name = 'RuntimeCapabilityUnavailableError'
  }
}

export class RuntimeCapabilityDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RuntimeCapabilityDefinitionError'
  }
}

function isCapabilityEnabled(
  definition: RuntimeCapabilityDefinition,
  context: RuntimeCapabilityLoadContext,
): boolean {
  if (definition.enabled === undefined) {
    return true
  }
  if (typeof definition.enabled === 'boolean') {
    return definition.enabled
  }
  return definition.enabled(context)
}

function errorToCapabilityError(error: unknown): KernelCapabilityError {
  if (error instanceof Error) {
    return {
      code: error.name || 'CAPABILITY_LOAD_FAILED',
      message: error.message,
      retryable: true,
    }
  }

  return {
    code: 'CAPABILITY_LOAD_FAILED',
    message: String(error),
    retryable: true,
  }
}

function createDescriptor(
  definition: RuntimeCapabilityDefinition,
  status: KernelCapabilityStatus,
  error?: KernelCapabilityError,
): KernelCapabilityDescriptor {
  return {
    name: definition.name,
    status,
    lazy: definition.lazy ?? true,
    dependencies: definition.dependencies ?? [],
    reloadable: definition.reloadable ?? true,
    error,
    metadata: definition.metadata,
  }
}

function shouldDegradeOnFailure(
  definition: RuntimeCapabilityDefinition,
  error: unknown,
  context: RuntimeCapabilityLoadContext,
): boolean {
  const policy =
    definition.degradeOnFailure ??
    (definition.metadata?.optional === true ? true : false)
  if (typeof policy === 'boolean') {
    return policy
  }
  return policy(error, context)
}

export class RuntimeCapabilityResolver {
  private readonly entries = new Map<KernelCapabilityName, RuntimeCapabilityEntry>()

  constructor(
    definitions: readonly RuntimeCapabilityDefinition[],
    private readonly baseContext: RuntimeCapabilityLoadContext = {},
  ) {
    for (const definition of definitions) {
      this.addDefinition(definition)
    }
  }

  listDescriptors(): readonly KernelCapabilityDescriptor[] {
    return [...this.entries.values()].map(entry => entry.descriptor)
  }

  getDescriptor(
    name: KernelCapabilityName,
  ): KernelCapabilityDescriptor | undefined {
    return this.entries.get(name)?.descriptor
  }

  async requireCapability(
    name: KernelCapabilityName,
    context: RuntimeCapabilityLoadContext = {},
  ): Promise<RuntimeCapabilityLoadResult> {
    return this.loadCapability(name, context)
  }

  async loadCapability(
    name: KernelCapabilityName,
    context: RuntimeCapabilityLoadContext = {},
  ): Promise<RuntimeCapabilityLoadResult> {
    const entry = this.requireEntry(name)
    const mergedContext = this.mergeContext(context)
    this.assertLoadable(entry, mergedContext)

    if (
      entry.descriptor.status === 'ready' ||
      entry.descriptor.status === 'degraded'
    ) {
      return entry.value
    }
    if (entry.loading) {
      return entry.loading
    }

    entry.loading = this.loadEntry(entry, mergedContext)
    return entry.loading
  }

  async reloadCapabilities(
    scope: KernelCapabilityReloadScope = { type: 'runtime' },
    context: RuntimeCapabilityLoadContext = {},
  ): Promise<readonly KernelCapabilityDescriptor[]> {
    const names = this.resolveReloadNames(scope)
    const mergedContext = this.mergeContext(context)

    for (const name of names) {
      const entry = this.entries.get(name)
      if (!entry?.descriptor.reloadable) {
        continue
      }
      this.resetEntry(entry, mergedContext)
    }

    return this.listDescriptors()
  }

  private addDefinition(definition: RuntimeCapabilityDefinition): void {
    if (this.entries.has(definition.name)) {
      throw new RuntimeCapabilityDefinitionError(
        `Duplicate runtime capability ${definition.name}`,
      )
    }

    const enabled = isCapabilityEnabled(definition, this.baseContext)
    this.entries.set(definition.name, {
      definition,
      descriptor: createDescriptor(
        definition,
        enabled ? 'declared' : 'disabled',
      ),
    })
  }

  private async loadEntry(
    entry: RuntimeCapabilityEntry,
    context: RuntimeCapabilityLoadContext,
  ): Promise<RuntimeCapabilityLoadResult> {
    entry.descriptor = createDescriptor(entry.definition, 'loading')

    try {
      await this.loadDependencies(entry, context)
      const value = entry.definition.load
        ? await entry.definition.load(context)
        : undefined
      entry.value = value
      entry.descriptor = createDescriptor(entry.definition, 'ready')
      return value
    } catch (error) {
      entry.value = undefined
      const capabilityError = errorToCapabilityError(error)
      if (shouldDegradeOnFailure(entry.definition, error, context)) {
        entry.descriptor = createDescriptor(
          entry.definition,
          'degraded',
          capabilityError,
        )
        return undefined
      }
      entry.descriptor = createDescriptor(
        entry.definition,
        'failed',
        capabilityError,
      )
      throw error
    } finally {
      entry.loading = undefined
    }
  }

  private async loadDependencies(
    entry: RuntimeCapabilityEntry,
    context: RuntimeCapabilityLoadContext,
  ): Promise<void> {
    for (const dependency of entry.descriptor.dependencies) {
      await this.loadCapability(dependency, context)
    }
  }

  private assertLoadable(
    entry: RuntimeCapabilityEntry,
    context: RuntimeCapabilityLoadContext,
  ): void {
    if (!isCapabilityEnabled(entry.definition, context)) {
      entry.descriptor = createDescriptor(entry.definition, 'disabled')
      throw new RuntimeCapabilityUnavailableError(
        'CAPABILITY_DISABLED',
        entry.definition.name,
      )
    }

    if (entry.descriptor.status === 'failed') {
      throw new RuntimeCapabilityUnavailableError(
        'CAPABILITY_FAILED',
        entry.definition.name,
        entry.descriptor.error?.message,
      )
    }
  }

  private resetEntry(
    entry: RuntimeCapabilityEntry,
    context: RuntimeCapabilityLoadContext,
  ): void {
    entry.loading = undefined
    entry.value = undefined
    entry.descriptor = createDescriptor(
      entry.definition,
      isCapabilityEnabled(entry.definition, context) ? 'declared' : 'disabled',
    )
  }

  private resolveReloadNames(
    scope: KernelCapabilityReloadScope,
  ): readonly KernelCapabilityName[] {
    switch (scope.type) {
      case 'capability':
        return [scope.name]
      case 'dependency-closure':
        return this.getDependencyClosure(scope.name)
      case 'workspace':
      case 'runtime':
        return [...this.entries.keys()]
    }
  }

  private getDependencyClosure(
    name: KernelCapabilityName,
    seen = new Set<KernelCapabilityName>(),
  ): readonly KernelCapabilityName[] {
    if (seen.has(name)) {
      return [...seen]
    }
    seen.add(name)
    const entry = this.entries.get(name)
    for (const dependency of entry?.descriptor.dependencies ?? []) {
      this.getDependencyClosure(dependency, seen)
    }
    return [...seen]
  }

  private requireEntry(name: KernelCapabilityName): RuntimeCapabilityEntry {
    const entry = this.entries.get(name)
    if (!entry) {
      throw new RuntimeCapabilityUnavailableError(
        'CAPABILITY_NOT_FOUND',
        name,
      )
    }
    return entry
  }

  private mergeContext(
    context: RuntimeCapabilityLoadContext,
  ): RuntimeCapabilityLoadContext {
    return {
      ...this.baseContext,
      ...context,
      metadata: {
        ...this.baseContext.metadata,
        ...context.metadata,
      },
    }
  }
}

export function createRuntimeCapabilityResolver(
  definitions: readonly RuntimeCapabilityDefinition[],
  context?: RuntimeCapabilityLoadContext,
): RuntimeCapabilityResolver {
  return new RuntimeCapabilityResolver(definitions, context)
}
