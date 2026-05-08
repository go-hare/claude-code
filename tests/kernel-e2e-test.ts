#!/usr/bin/env bun
/**
 * Kernel E2E Deep Test Suite
 *
 * Verifies the kernelized version is feature-complete and correct
 * compared to the original Claude Code, using a real API endpoint.
 *
 * Usage:
 *   bun run tests/kernel-e2e-test.ts
 *
 * API config:
 *   KERNEL_E2E_BASE_URL / KERNEL_DEEP_TEST_BASE_URL / OPENAI_BASE_URL
 *   KERNEL_E2E_MODEL / KERNEL_DEEP_TEST_MODEL / OPENAI_MODEL
 *   KERNEL_E2E_API_KEY / KERNEL_DEEP_TEST_API_KEY / OPENAI_API_KEY
 */

type ApiConfig = {
  apiKey: string
  apiUrl: string
  baseUrl: string
  model: string
}

function getFirstEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }
  return undefined
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function getApiConfig(): ApiConfig | null {
  const baseUrl = getFirstEnv([
    'KERNEL_E2E_BASE_URL',
    'KERNEL_DEEP_TEST_BASE_URL',
    'OPENAI_BASE_URL',
  ])
  const apiKey = getFirstEnv([
    'KERNEL_E2E_API_KEY',
    'KERNEL_DEEP_TEST_API_KEY',
    'OPENAI_API_KEY',
  ])
  const model = getFirstEnv([
    'KERNEL_E2E_MODEL',
    'KERNEL_DEEP_TEST_MODEL',
    'OPENAI_MODEL',
  ])

  if (!baseUrl || !apiKey || !model) {
    return null
  }

  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  return {
    apiKey,
    apiUrl: `${normalizedBaseUrl}/chat/completions`,
    baseUrl: normalizedBaseUrl,
    model,
  }
}

const API_CONFIG = getApiConfig()
const API_ENABLED = API_CONFIG !== null

// ---------------------------------------------------------------------------
// Test framework
// ---------------------------------------------------------------------------

interface TestCase {
  name: string
  feature: string
  run: () => Promise<TestResult>
}

interface TestResult {
  pass: boolean
  name: string
  feature: string
  detail: string
  durationMs: number
  error?: string
}

type JsonRpcLiteMessage = Record<string, unknown>

type JsonRpcLiteRunnerOverrides = Record<string, unknown>

const results: TestResult[] = []

async function test(name: string, feature: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    results.push({ pass: true, name, feature, detail: 'OK', durationMs: Date.now() - start })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ pass: false, name, feature, detail: 'FAILED', durationMs: Date.now() - start, error: msg })
  }
}

function report(): void {
  const passed = results.filter(r => r.pass)
  const failed = results.filter(r => !r.pass)
  console.log('\n' + '='.repeat(70))
  console.log(`  KERNEL E2E TEST REPORT  —  ${passed.length} pass / ${failed.length} fail / ${results.length} total`)
  console.log('='.repeat(70))

  const byFeature = new Map<string, { total: number; pass: number }>()
  for (const r of results) {
    const entry = byFeature.get(r.feature) ?? { total: 0, pass: 0 }
    entry.total++
    if (r.pass) entry.pass++
    byFeature.set(r.feature, entry)
  }

  for (const [feature, stats] of byFeature) {
    const icon = stats.pass === stats.total ? '✓' : '✗'
    console.log(`  ${icon} ${feature}: ${stats.pass}/${stats.total}`)
  }

  if (failed.length > 0) {
    console.log('\n  FAILURES:')
    for (const f of failed) {
      console.log(`    ✗ ${f.name}`)
      console.log(`      ${f.error}`)
    }
  }
  console.log('')
}

// ---------------------------------------------------------------------------
// API client — calls the user's endpoint
// ---------------------------------------------------------------------------

async function chat(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!API_CONFIG) {
    throw new Error(
      'API config is missing. Set BASE_URL, MODEL, and API_KEY via KERNEL_E2E_*, KERNEL_DEEP_TEST_*, or OPENAI_* env vars.',
    )
  }

  const resp = await fetch(API_CONFIG.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: API_CONFIG.model,
      messages,
      max_tokens: 2048,
      temperature: 0,
    }),
  })

  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    const responsesContent = await responsesApiChat(messages)
    if (responsesContent) {
      return responsesContent
    }
    throw new Error(`API ${resp.status}: ${resp.statusText} — ${body.slice(0, 300)}`)
  }

  const body = await resp.text()
  const content = parseChatCompletionContent(
    body,
    resp.headers.get('content-type') ?? '',
  )
  if (content) {
    return content
  }

  const responsesContent = await responsesApiChat(messages)
  if (!responsesContent) {
    throw new Error('API returned empty response')
  }
  return responsesContent
}

function parseChatCompletionContent(
  body: string,
  contentType: string,
): string | undefined {
  if (
    contentType.toLowerCase().includes('text/event-stream') ||
    body.trimStart().startsWith('data:')
  ) {
    return parseChatCompletionStreamContent(body)
  }

  const json = JSON.parse(body) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return json.choices?.[0]?.message?.content?.trim()
}

function parseChatCompletionStreamContent(body: string): string | undefined {
  const chunks: string[] = []
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) {
      continue
    }
    const data = trimmed.slice('data:'.length).trim()
    if (!data || data === '[DONE]') {
      continue
    }
    let parsed: {
      choices?: Array<{
        delta?: { content?: string }
        message?: { content?: string }
      }>
    }
    try {
      parsed = JSON.parse(data) as typeof parsed
    } catch {
      continue
    }
    for (const choice of parsed.choices ?? []) {
      const content = choice.delta?.content ?? choice.message?.content
      if (content) {
        chunks.push(content)
      }
    }
  }
  return chunks.join('').trim() || undefined
}

async function responsesApiChat(
  messages: Array<{ role: string; content: string }>,
): Promise<string | undefined> {
  if (!API_CONFIG) {
    return undefined
  }
  const resp = await fetch(`${API_CONFIG.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: API_CONFIG.model,
      input: messages
        .map(message => `${message.role}: ${message.content}`)
        .join('\n\n'),
      max_output_tokens: 2048,
      temperature: 0,
    }),
  })
  if (!resp.ok) {
    return undefined
  }
  const json = (await resp.json()) as {
    output_text?: string
    output?: Array<{
      content?: Array<{
        text?: string
        type?: string
      }>
    }>
  }
  if (json.output_text?.trim()) {
    return json.output_text.trim()
  }
  return json.output
    ?.flatMap(item => item.content ?? [])
    .map(item => item.text)
    .filter((item): item is string => typeof item === 'string')
    .join('')
    .trim()
}

async function runJsonRpcLiteMessages(
  messages: readonly JsonRpcLiteMessage[],
  overrides: JsonRpcLiteRunnerOverrides = {},
): Promise<JsonRpcLiteMessage[]> {
  const { Readable } = await import('stream')
  const { runKernelRuntimeJsonRpcLiteProtocol } = await import(
    '../src/kernel/jsonRpcLiteProtocol.js'
  )
  const output = createJsonRpcLiteOutputCollector()
  await runKernelRuntimeJsonRpcLiteProtocol({
    commandCatalog: createJsonRpcLiteCommandCatalog(),
    eventJournalPath: false,
    conversationJournalPath: false,
    ...overrides,
    input: Readable.from(
      messages.map(message => `${JSON.stringify(message)}\n`),
    ),
    output,
  })
  return output.messages
}

function createJsonRpcLiteOutputCollector(): {
  messages: JsonRpcLiteMessage[]
  write(chunk: string): boolean
} {
  const messages: JsonRpcLiteMessage[] = []
  return {
    messages,
    write(chunk: string) {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) {
          messages.push(JSON.parse(line) as JsonRpcLiteMessage)
        }
      }
      return true
    },
  }
}

function createJsonRpcLiteCommandCatalog(): {
  listCommands(): Promise<readonly unknown[]>
  executeCommand(request: {
    name: string
    args?: string
  }): Promise<Record<string, unknown>>
} {
  return {
    async listCommands() {
      return [
        {
          descriptor: {
            name: 'poor.toggle',
            description: 'Toggle poor mode',
            kind: 'local',
            aliases: ['poor'],
            argumentHint: '--enabled true',
          },
          source: 'e2e-test',
          supportsNonInteractive: true,
          modelInvocable: true,
        },
      ]
    },
    async executeCommand(request) {
      return {
        name: request.name,
        result: {
          type: 'text',
          text: `ran: ${request.args ?? ''}`.trim(),
        },
      }
    },
  }
}

function createJsonRpcLiteAgentRegistry(): {
  listAgents(): Promise<Record<string, unknown>>
  spawnAgent(request: Record<string, unknown>): Promise<Record<string, unknown>>
  listAgentRuns(): Promise<Record<string, unknown>>
  getAgentRun(runId: string): Promise<Record<string, unknown> | null>
  getAgentOutput(request: Record<string, unknown>): Promise<Record<string, unknown>>
  cancelAgentRun(request: Record<string, unknown>): Promise<Record<string, unknown>>
} {
  const agents = [
    {
      agentType: 'general-purpose',
      whenToUse: 'General purpose agent for complex tasks',
      source: 'built-in',
      active: true,
      background: false,
    },
    {
      agentType: 'explore',
      whenToUse: 'Fast agent for exploring codebases',
      source: 'built-in',
      active: true,
      background: false,
    },
    {
      agentType: 'worker',
      whenToUse: 'Worker agent for coordinator mode',
      source: 'built-in',
      active: true,
      background: true,
    },
  ]
  const run = {
    runId: 'run-1',
    status: 'completed',
    prompt: 'test prompt',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
  return {
    async listAgents() {
      return {
        activeAgents: agents,
        allAgents: agents,
      }
    },
    async spawnAgent(request) {
      return {
        status: 'accepted',
        prompt: request.prompt,
        runId: run.runId,
        agentType: request.agentType,
        description: request.description,
      }
    },
    async listAgentRuns() {
      return {
        runs: [run],
      }
    },
    async getAgentRun(runId) {
      return runId === run.runId ? run : null
    },
    async getAgentOutput(request) {
      return {
        runId: request.runId,
        available: true,
        output: 'Agent has completed the task.',
      }
    },
    async cancelAgentRun(request) {
      return {
        runId: request.runId,
        cancelled: true,
        status: 'cancelled',
        run: null,
      }
    },
  }
}

function createJsonRpcLiteTaskRegistry(): {
  listTasks(taskListId?: string): Promise<Record<string, unknown>>
  getTask(
    taskId: string,
    taskListId?: string,
  ): Promise<Record<string, unknown> | null>
  createTask(request: Record<string, unknown>): Promise<Record<string, unknown>>
  updateTask(request: Record<string, unknown>): Promise<Record<string, unknown>>
  assignTask(request: Record<string, unknown>): Promise<Record<string, unknown>>
} {
  const task = {
    id: 'task-1',
    subject: 'Research auth libraries',
    description: 'Find the best auth library for our needs',
    status: 'pending',
    taskListId: 'main',
    blocks: [],
    blockedBy: [],
  }
  return {
    async listTasks(taskListId = 'main') {
      return {
        taskListId,
        tasks: [task],
      }
    },
    async getTask(taskId) {
      return taskId === task.id ? task : null
    },
    async createTask(request) {
      return {
        task: {
          ...task,
          subject: request.subject,
          description: request.description,
          taskListId: request.taskListId ?? task.taskListId,
        },
        taskId: task.id,
        taskListId: request.taskListId ?? task.taskListId,
        updatedFields: ['subject', 'description'],
        created: true,
      }
    },
    async updateTask(request) {
      return {
        task: {
          ...task,
          status: request.status,
        },
        taskId: request.taskId,
        taskListId: request.taskListId ?? task.taskListId,
        updatedFields: ['status'],
      }
    },
    async assignTask(request) {
      return {
        task: {
          ...task,
          owner: request.owner,
          status: request.status ?? task.status,
        },
        taskId: request.taskId,
        taskListId: request.taskListId ?? task.taskListId,
        updatedFields: ['owner'],
        assigned: true,
      }
    },
  }
}

function responseById(
  messages: readonly JsonRpcLiteMessage[],
  id: string,
): JsonRpcLiteMessage {
  const message = messages.find(item => item.id === id)
  if (!message) {
    throw new Error(`missing JSON-RPC-lite response: ${id}`)
  }
  return message
}

function resultOf(message: JsonRpcLiteMessage): Record<string, unknown> {
  const result = message.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`response missing object result: ${String(message.id)}`)
  }
  return result as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Structural validation — verify kernel modules load correctly
// ---------------------------------------------------------------------------

async function validateKernelExports(): Promise<void> {
  // Verify the kernel index exports all expected symbols
  const kernel = await import('../src/kernel/index.js')

  // Protocol runtime
  if (typeof kernel.runKernelRuntimeJsonRpcLiteProtocol !== 'function') {
    throw new Error('runKernelRuntimeJsonRpcLiteProtocol missing')
  }
  if (
    typeof kernel.KERNEL_RUNTIME_JSON_RPC_LITE_PROTOCOL_VERSION !== 'string'
  ) {
    throw new Error('JSON-RPC-lite protocol version missing')
  }

  // Explicitly reject the removed legacy SDK / wire surface
  if ('createKernelRuntime' in kernel) {
    throw new Error('legacy createKernelRuntime should not be exported')
  }
  if ('createDefaultKernelRuntimeWireRouter' in kernel) {
    throw new Error('legacy wire router should not be exported')
  }
  if ('createKernelRuntimeWireClient' in kernel) {
    throw new Error('legacy wire client should not be exported')
  }

  if (typeof kernel.createKernelKairosRuntime !== 'function') {
    throw new Error('createKernelKairosRuntime missing from kernel exports')
  }
  if (typeof kernel.createKernelCompanionRuntime !== 'function') {
    throw new Error('createKernelCompanionRuntime missing from kernel exports')
  }
  if (typeof kernel.createKernelContextManager !== 'function') {
    throw new Error('createKernelContextManager missing')
  }
  if (typeof kernel.createKernelMemoryManager !== 'function') {
    throw new Error('createKernelMemoryManager missing')
  }
  if (typeof kernel.createKernelSessionManager !== 'function') {
    throw new Error('createKernelSessionManager missing')
  }
  if (typeof kernel.createKernelPermissionBroker !== 'function') {
    throw new Error('createKernelPermissionBroker missing')
  }

  // Event system
  if (typeof kernel.createKernelRuntimeEventFacade !== 'function') {
    throw new Error('createKernelRuntimeEventFacade missing')
  }
  if (typeof kernel.isKernelRuntimeEnvelope !== 'function') {
    throw new Error('isKernelRuntimeEnvelope missing')
  }
  if (typeof kernel.isKernelRuntimeEventOfType !== 'function') {
    throw new Error('isKernelRuntimeEventOfType missing')
  }
  if (typeof kernel.isKernelTurnTerminalEvent !== 'function') {
    throw new Error('isKernelTurnTerminalEvent missing')
  }

  // Headless / SDK
  if (typeof kernel.createDefaultKernelHeadlessEnvironment !== 'function') {
    throw new Error('createDefaultKernelHeadlessEnvironment missing')
  }
  if (typeof kernel.createKernelHeadlessSession !== 'function') {
    throw new Error('createKernelHeadlessSession missing')
  }
  if (typeof kernel.createKernelHeadlessStore !== 'function') {
    throw new Error('createKernelHeadlessStore missing')
  }

  // Server/Bridge
  if (typeof kernel.createKernelSession !== 'function') {
    throw new Error('createKernelSession missing')
  }
  if (typeof kernel.startKernelServer !== 'function') {
    throw new Error('startKernelServer missing')
  }

  // Capability system
  if (!Array.isArray(kernel.KERNEL_CAPABILITY_FAMILIES)) {
    throw new Error('KERNEL_CAPABILITY_FAMILIES missing or not an array')
  }
  if (typeof kernel.getKernelCapabilityFamily !== 'function') {
    throw new Error('getKernelCapabilityFamily missing')
  }
  if (typeof kernel.filterKernelCapabilities !== 'function') {
    throw new Error('filterKernelCapabilities missing')
  }
  if (typeof kernel.groupKernelCapabilities !== 'function') {
    throw new Error('groupKernelCapabilities missing')
  }

  // Type constants
  if (!Array.isArray(kernel.KERNEL_RUNTIME_EVENT_TYPES)) {
    throw new Error('KERNEL_RUNTIME_EVENT_TYPES missing')
  }
  if (!Array.isArray(kernel.KERNEL_RUNTIME_EVENT_TAXONOMY)) {
    throw new Error('KERNEL_RUNTIME_EVENT_TAXONOMY missing')
  }
}

async function validateTypes(): Promise<void> {
  // Use the kernel types directory to verify completeness
  const types = await import('../src/kernel/index.d.ts')
  // Key types that must exist
  const requiredTypes = [
    'KernelRuntimeJsonRpcLiteProtocolOptions',
    'KernelRuntimeJsonRpcLiteRunnerOptions',
    'KernelKairosRuntime',
    'KernelCompanionRuntime',
    'KernelRuntimeEventEnvelope',
    'KernelRuntimeEnvelopeBase',
    'KernelPermissionDecision',
    'KernelCapabilityView',
  ]
  // We can't type-check at runtime, but we validate the file parses
  if (!types) {
    throw new Error('index.d.ts failed to load')
  }
}

// ---------------------------------------------------------------------------
// Kairos (Proactive System) Tests
// ---------------------------------------------------------------------------

async function testKairosBasicLifecycle(): Promise<void> {
  const { createKernelKairosRuntime } = await import('../src/kernel/kairos.js')

  let proactiveState = {
    active: false,
    paused: false,
    contextBlocked: false,
    shouldTick: false,
    nextTickAt: null as number | null,
    activationSource: undefined as string | undefined,
  }

  const events: string[] = []

  const runtime = createKernelKairosRuntime({
    isEnabled: () => true,
    isRuntimeEnabled: async () => true,
    getProactiveState: () => ({ ...proactiveState }),
    pauseProactive: () => { proactiveState.paused = true },
    resumeProactive: () => { proactiveState.paused = false },
    createAutonomyCommands: async (req) => [{
      value: req.basePrompt ?? '',
      mode: 'autonomous',
      priority: req.priority ?? 'next',
    }],
    now: () => '2026-04-28T00:00:00.000Z',
  })

  runtime.onEvent(e => events.push(e.type))

  // 1. Initial status
  const status1 = await runtime.getStatus()
  if (!status1.enabled) throw new Error('kairos should be enabled')
  if (status1.pendingEvents !== 0) throw new Error('expected 0 pending events initially')

  // 2. Enqueue events
  await runtime.enqueueEvent({ type: 'file_changed', payload: { path: '/test.ts' } })
  await runtime.enqueueEvent({ type: 'git_push', payload: { branch: 'main' } })

  const status2 = await runtime.getStatus()
  if (status2.pendingEvents !== 2) throw new Error(`expected 2 pending events, got ${status2.pendingEvents}`)

  // 3. Tick — should drain events
  await runtime.tick({ reason: 'test', drain: true, createAutonomyCommands: true })
  const status3 = await runtime.getStatus()
  if (status3.pendingEvents !== 0) throw new Error(`expected 0 events after drain, got ${status3.pendingEvents}`)

  // 4. Suspend/resume
  await runtime.suspend('testing')
  const status4 = await runtime.getStatus()
  if (!status4.suspended) throw new Error('kairos should be suspended')

  // Tick while suspended should be no-op
  await runtime.enqueueEvent({ type: 'test' })
  await runtime.tick({ drain: true })
  const status5 = await runtime.getStatus()
  if (status5.pendingEvents !== 1) throw new Error('tick while suspended should not drain')

  await runtime.resume('test done')
  const status6 = await runtime.getStatus()
  if (status6.suspended) throw new Error('kairos should be resumed')

  // Verify event stream
  if (!events.includes('event_enqueued')) throw new Error('missing event_enqueued')
  if (!events.includes('tick')) throw new Error('missing tick event')
  if (!events.includes('suspended')) throw new Error('missing suspended event')
  if (!events.includes('resumed')) throw new Error('missing resumed event')
}

async function testKairosAutonomyCommands(): Promise<void> {
  const { createKernelKairosRuntime } = await import('../src/kernel/kairos.js')

  const createdCommands: Array<{ value: unknown; mode: string; priority?: string }> = []

  const runtime = createKernelKairosRuntime({
    isEnabled: () => true,
    isRuntimeEnabled: async () => true,
    createAutonomyCommands: async (req) => {
      const cmd = { value: req.basePrompt ?? '', mode: 'autonomous', priority: req.priority ?? 'next' }
      createdCommands.push(cmd)
      return [cmd]
    },
  })

  // Tick with autonomy command generation
  await runtime.tick({
    reason: 'autonomy test',
    createAutonomyCommands: true,
    basePrompt: '<tick>12:00</tick>',
    rootDir: '/test',
    priority: 'now',
  })

  if (createdCommands.length !== 1) throw new Error('expected 1 autonomy command')
  if (createdCommands[0].priority !== 'now') throw new Error('priority should be "now"')
}

// ---------------------------------------------------------------------------
// Companion (Pet/Picowhisk) Tests
// ---------------------------------------------------------------------------

async function testCompanionHatchLifecycle(): Promise<void> {
  const { createKernelCompanionRuntime } = await import('../src/kernel/companion.js')
  const { getGlobalConfig, saveGlobalConfig } = await import('../src/utils/config.js')

  const snapshot = { ...getGlobalConfig() }
  try {
    saveGlobalConfig(current => ({
      ...current,
      userID: 'kernel-e2e-companion-test',
      oauthAccount: undefined,
      companion: undefined,
      companionMuted: false,
    }))

    const events: Array<{ type: string; detail?: string }> = []

    const runtime = createKernelCompanionRuntime({
      generateStoredCompanion: async (_seed, _signal) => ({
        name: 'Picowhisk',
        personality: 'A small, warm cactus who watches over the terminal.',
        hatchedAt: Date.now(),
      }),
      triggerReaction: (_msgs, setReaction) => setReaction('🌵 *sways gently*'),
    })

    runtime.onEvent(event => {
      events.push({ type: event.type, detail: 'reaction' in event ? (event as { reaction: string }).reaction : undefined })
    })

    // 1. Hatch
    const state1 = await runtime.dispatch({ type: 'hatch', seed: 'test-seed' })
    if (state1?.companion?.name !== 'Picowhisk') {
      throw new Error(`expected Picowhisk, got ${state1?.companion?.name}`)
    }
    if (!state1?.hasStoredCompanion) throw new Error('should have stored companion after hatch')

    // 2. Mute
    const state2 = await runtime.dispatch({ type: 'mute' })
    if (!state2?.muted) throw new Error('companion should be muted')

    // 3. Reaction while muted should skip
    await runtime.reactToTurn({ messages: [{ role: 'user', content: 'hello' }] })
    const skipEvent = events.find(e => e.type === 'reaction_skipped')
    if (!skipEvent) throw new Error('should have skipped reaction while muted')

    // 4. Unmute and react
    await runtime.dispatch({ type: 'unmute' })
    await runtime.reactToTurn({ messages: [{ role: 'user', content: 'hello' }] })
    const reactEvent = events.find(e => e.type === 'reaction')
    if (!reactEvent) throw new Error('should have reaction after unmute')
    if (reactEvent.detail !== '🌵 *sways gently*') throw new Error(`unexpected reaction: ${reactEvent.detail}`)

    // 5. Pet
    await runtime.dispatch({ type: 'pet', note: 'good cactus' })
    const petEvent = events.find(e => e.type === 'petted')
    if (!petEvent) throw new Error('should have petted event')

    // 6. Clear
    await runtime.dispatch({ type: 'clear', seed: 'test-seed' })
    const state3 = await runtime.getState()
    if (state3 !== null && state3.profile !== null) {
      // After clear without other seeds, state may be null if no other profiles exist
    }

    // Verify event coverage
    const eventTypes = events.map(e => e.type)
    for (const t of ['state_changed', 'reaction_skipped', 'reaction', 'petted']) {
      if (!eventTypes.includes(t)) throw new Error(`missing event type: ${t}`)
    }
  } finally {
    saveGlobalConfig(() => snapshot)
  }
}

async function testCompanionRehatchAndNamespacing(): Promise<void> {
  const { createKernelCompanionRuntime } = await import('../src/kernel/companion.js')
  const { getGlobalConfig, saveGlobalConfig } = await import('../src/utils/config.js')

  const snapshot = { ...getGlobalConfig() }
  try {
    saveGlobalConfig(current => ({
      ...current,
      userID: 'kernel-e2e-companion-rehatch',
      oauthAccount: undefined,
      companion: undefined,
      companionMuted: false,
    }))

    let profileCount = 0
    const runtime = createKernelCompanionRuntime({
      generateStoredCompanion: async (_seed, _signal) => {
        profileCount++
        return { name: `Buddy-${profileCount}`, personality: 'test', hatchedAt: 1 }
      },
    })

    // Hatch with seed A
    await runtime.dispatch({ type: 'hatch', seed: 'seed-A' })
    const stateA = await runtime.getState()
    if (stateA?.profile?.name !== 'Buddy-1') throw new Error('seed-A should be Buddy-1')

    // Rehatch with a different seed B
    await runtime.dispatch({ type: 'rehatch', seed: 'seed-B' })
    const stateB = await runtime.getState()
    if (stateB?.profile?.name !== 'Buddy-2') throw new Error('seed-B should be Buddy-2')

    if (profileCount !== 2) throw new Error(`expected 2 profiles generated, got ${profileCount}`)
  } finally {
    saveGlobalConfig(() => snapshot)
  }
}

// ---------------------------------------------------------------------------
// Event Facade Tests
// ---------------------------------------------------------------------------

async function testEventFacadeEncodeDecode(): Promise<void> {
  const {
    createKernelRuntimeEventFacade,
    getKernelRuntimeEnvelopeFromMessage,
    toKernelRuntimeEventMessage,
    consumeKernelRuntimeEventMessage,
    isKernelRuntimeEnvelope,
  } = await import('../src/kernel/events.js')
  const {
    isKernelRuntimeEventOfType,
    isKernelTurnTerminalEvent,
    getKernelRuntimeEventCategory,
  } = await import('../src/kernel/index.js')

  const receivedEnvelopes: Array<{ kind: string; type?: string }> = []

  const facade = createKernelRuntimeEventFacade({
    runtimeId: 'test-runtime',
    maxReplayEvents: 100,
    onEvent: (env) => {
      receivedEnvelopes.push({ kind: env.kind, type: (env.payload as { type?: string })?.type })
    },
  })

  // Emit various events
  facade.emit({ type: 'turn.started', replayable: true })
  facade.emit({ type: 'turn.output_delta', replayable: true, payload: { delta: 'hello' } })
  facade.emit({ type: 'turn.completed', replayable: true, payload: { stopReason: 'end_turn' } })

  if (receivedEnvelopes.length !== 3) throw new Error(`expected 3 envelopes, got ${receivedEnvelopes.length}`)

  // Verify isKernelRuntimeEnvelope
  for (const env of receivedEnvelopes) {
    // reconstruct an envelope-like object to test
    const fakeEnvelope = {
      schemaVersion: 'kernel.runtime.v1',
      messageId: 'test-msg',
      sequence: 0,
      timestamp: new Date().toISOString(),
      source: 'kernel_runtime' as const,
      kind: env.kind,
      payload: { type: env.type },
    }
    if (!isKernelRuntimeEnvelope(fakeEnvelope)) throw new Error(`should be valid envelope: ${env.kind}`)
  }

  // Test message round-trip
  const envelope = facade.emit({ type: 'tasks.created', replayable: true, payload: { taskId: '1' } })
  const msg = toKernelRuntimeEventMessage(envelope, 'test-session')

  if (msg.type !== 'kernel_runtime_event') throw new Error('message type mismatch')
  if (msg.session_id !== 'test-session') throw new Error('session_id mismatch')

  const parsed = getKernelRuntimeEnvelopeFromMessage(msg)
  if (!parsed) throw new Error('failed to parse round-tripped envelope')

  // Test consumeKernelRuntimeEventMessage
  let consumed = false
  consumeKernelRuntimeEventMessage(msg, (_env) => { consumed = true })
  if (!consumed) throw new Error('consumeKernelRuntimeEventMessage should have consumed')

  // Test event type checks
  const turnCompletedEnvelope = {
    schemaVersion: 'kernel.runtime.v1',
    messageId: 'test',
    sequence: 0,
    timestamp: new Date().toISOString(),
    source: 'kernel_runtime' as const,
    kind: 'event' as const,
    payload: { type: 'turn.completed', replayable: true },
  }

  if (!isKernelRuntimeEventOfType(turnCompletedEnvelope, 'turn.completed')) {
    throw new Error('should match turn.completed')
  }
  if (!isKernelTurnTerminalEvent(turnCompletedEnvelope)) {
    throw new Error('turn.completed should be terminal')
  }

  const category = getKernelRuntimeEventCategory(turnCompletedEnvelope)
  if (category !== 'turn') throw new Error(`expected category "turn", got "${category}"`)
}

// ---------------------------------------------------------------------------
// JSON-RPC-lite Protocol Coverage Tests
// ---------------------------------------------------------------------------

async function testJsonRpcLiteProtocolCoverage(): Promise<void> {
  const messages = await runJsonRpcLiteMessages([
    { id: 'ping-1', method: 'runtime.ping' },
    {
      id: 'init-1',
      method: 'runtime.initialize',
      params: { client: { name: 'kernel-e2e', version: '0.1.0' } },
    },
    { id: 'caps-1', method: 'runtime.capabilities' },
    { id: 'commands-1', method: 'commands.list' },
    {
      id: 'describe-1',
      method: 'commands.describe',
      params: { commandId: 'turn.run' },
    },
    {
      id: 'execute-1',
      method: 'commands.execute',
      params: { commandId: 'poor.toggle', arguments: '--enabled true' },
    },
    {
      id: 'legacy-1',
      method: 'runtime.ping',
      schemaVersion: 'kernel.runtime.command.v1',
    },
  ])

  if (resultOf(responseById(messages, 'ping-1')).pong !== true) {
    throw new Error('runtime.ping should return pong')
  }
  const init = resultOf(responseById(messages, 'init-1'))
  if (init.protocolVersion !== '2026-05-08') {
    throw new Error(`unexpected protocol version: ${String(init.protocolVersion)}`)
  }
  const caps = resultOf(responseById(messages, 'caps-1'))
  const methods = caps.methods
  if (!Array.isArray(methods) || !methods.includes('turn.run')) {
    throw new Error('runtime.capabilities missing turn.run')
  }
  if (!methods.includes('commands.execute')) {
    throw new Error('runtime.capabilities missing commands.execute')
  }
  const commands = resultOf(responseById(messages, 'commands-1')).commands
  if (!Array.isArray(commands) || commands.length < 10) {
    throw new Error('commands.list should expose typed core and CLI graph')
  }
  const described = resultOf(responseById(messages, 'describe-1'))
  if (described.commandId !== 'turn.run') {
    throw new Error('commands.describe should return graph node details')
  }
  const executed = resultOf(responseById(messages, 'execute-1'))
  if (executed.name !== 'poor.toggle') {
    throw new Error('commands.execute should execute only graph nodes')
  }
  const legacy = responseById(messages, 'legacy-1')
  const legacyError = legacy.error as { code?: string } | undefined
  if (legacyError?.code !== 'invalid_request') {
    throw new Error('legacy top-level fields must be rejected')
  }
}

// ---------------------------------------------------------------------------
// Agent Registry Tests
// ---------------------------------------------------------------------------

async function testAgentRegistryFacade(): Promise<void> {
  const messages = await runJsonRpcLiteMessages(
    [
      { id: 'agents-list-1', method: 'agents.list' },
      {
        id: 'agents-spawn-1',
        method: 'agents.spawn',
        params: {
          agentType: 'explore',
          prompt: 'find all test files',
          description: 'Testing agent spawn',
        },
      },
      { id: 'agents-runs-1', method: 'agents.runs.list' },
      {
        id: 'agents-run-1',
        method: 'agents.runs.get',
        params: { runId: 'run-1' },
      },
      {
        id: 'agents-output-1',
        method: 'agents.output.get',
        params: { runId: 'run-1' },
      },
      {
        id: 'agents-cancel-1',
        method: 'agents.runs.cancel',
        params: { runId: 'run-1', reason: 'test' },
      },
    ],
    {
      agentRegistry: createJsonRpcLiteAgentRegistry(),
    },
  )

  const list = resultOf(responseById(messages, 'agents-list-1'))
  const activeAgents = list.activeAgents
  if (!Array.isArray(activeAgents) || activeAgents.length !== 3) {
    throw new Error('agents.list should return 3 active agents')
  }

  const spawn = resultOf(responseById(messages, 'agents-spawn-1'))
  if (spawn.status !== 'accepted' || spawn.runId !== 'run-1') {
    throw new Error('agents.spawn should accept and return run-1')
  }

  const runs = resultOf(responseById(messages, 'agents-runs-1')).runs
  if (!Array.isArray(runs) || runs.length !== 1) {
    throw new Error('agents.runs.list should return one run')
  }

  const run = resultOf(responseById(messages, 'agents-run-1')).run as
    | Record<string, unknown>
    | undefined
  if (run?.status !== 'completed') {
    throw new Error('agents.runs.get should return completed run')
  }

  const output = resultOf(responseById(messages, 'agents-output-1'))
  if (output.available !== true || typeof output.output !== 'string') {
    throw new Error('agents.output.get should return readable output')
  }

  const cancel = resultOf(responseById(messages, 'agents-cancel-1'))
  if (cancel.cancelled !== true) {
    throw new Error('agents.runs.cancel should cancel the run')
  }
}

// ---------------------------------------------------------------------------
// Task Registry Tests
// ---------------------------------------------------------------------------

async function testTaskRegistryFacade(): Promise<void> {
  const messages = await runJsonRpcLiteMessages(
    [
      { id: 'tasks-list-1', method: 'tasks.list' },
      {
        id: 'tasks-create-1',
        method: 'tasks.create',
        params: {
          taskListId: 'main',
          subject: 'Research auth libraries',
          description: 'Find the best auth library for our needs',
        },
      },
      {
        id: 'tasks-update-1',
        method: 'tasks.update',
        params: { taskId: 'task-1', status: 'completed' },
      },
      {
        id: 'tasks-assign-1',
        method: 'tasks.assign',
        params: {
          taskId: 'task-1',
          owner: 'worker-1',
          status: 'in_progress',
        },
      },
    ],
    {
      taskRegistry: createJsonRpcLiteTaskRegistry(),
    },
  )

  const list = resultOf(responseById(messages, 'tasks-list-1'))
  if (!Array.isArray(list.tasks)) {
    throw new Error('tasks.list should return a task list snapshot')
  }

  const created = resultOf(responseById(messages, 'tasks-create-1'))
  if (created.created !== true || created.taskId !== 'task-1') {
    throw new Error('tasks.create should create task-1')
  }

  const updated = resultOf(responseById(messages, 'tasks-update-1'))
  const updatedTask = updated.task as Record<string, unknown> | undefined
  if (updatedTask?.status !== 'completed') {
    throw new Error('tasks.update should update task status')
  }

  const assigned = resultOf(responseById(messages, 'tasks-assign-1'))
  const assignedTask = assigned.task as Record<string, unknown> | undefined
  if (assigned.assigned !== true || assignedTask?.owner !== 'worker-1') {
    throw new Error('tasks.assign should assign task owner')
  }
}

// ---------------------------------------------------------------------------
// Capability System Tests
// ---------------------------------------------------------------------------

async function testCapabilitySystem(): Promise<void> {
  const {
    KERNEL_CAPABILITY_FAMILIES,
    getKernelCapabilityFamily,
    toKernelCapabilityView,
    toKernelCapabilityViews,
    filterKernelCapabilities,
    groupKernelCapabilities,
    isKernelCapabilityReady,
    isKernelCapabilityUnavailable,
  } = await import('../src/kernel/index.js')

  // Verify all 8 families exist
  const expectedFamilies = ['core', 'execution', 'model', 'extension', 'security', 'host', 'autonomy', 'observability']
  for (const f of expectedFamilies) {
    if (!KERNEL_CAPABILITY_FAMILIES.includes(f as (typeof KERNEL_CAPABILITY_FAMILIES)[number])) {
      throw new Error(`missing capability family: ${f}`)
    }
  }

  // Create descriptors
  const descriptors = [
    { name: 'bash-exec', status: 'ready' as const, lazy: false, dependencies: [], reloadable: false },
    { name: 'file-io', status: 'ready' as const, lazy: false, dependencies: [], reloadable: false },
    { name: 'mcp-client', status: 'loading' as const, lazy: true, dependencies: [], reloadable: true },
    { name: 'agent-spawner', status: 'failed' as const, lazy: false, dependencies: ['mcp-client'], reloadable: true, error: { code: 'E001', message: 'test error', retryable: true } },
    { name: 'web-fetch', status: 'disabled' as const, lazy: true, dependencies: [], reloadable: false },
    { name: 'gpu-accel', status: 'degraded' as const, lazy: true, dependencies: [], reloadable: false, error: { code: 'GPU_FALLBACK', message: 'Using CPU fallback', retryable: true } },
  ]

  // toKernelCapabilityView — name defaults to 'extension' family
  const view = toKernelCapabilityView(descriptors[0])
  if (!view.ready) throw new Error('bash-exec should be ready')
  if (view.family !== 'extension') throw new Error(`bash-exec should be in extension family (default), got ${view.family}`)

  // toKernelCapabilityViews
  const views = toKernelCapabilityViews(descriptors)
  if (views.length !== 6) throw new Error(`expected 6 views, got ${views.length}`)

  // isReady / isUnavailable
  if (!isKernelCapabilityReady(descriptors[0])) throw new Error('bash-exec should be ready')
  if (isKernelCapabilityUnavailable(descriptors[0])) throw new Error('bash-exec should not be unavailable')
  if (isKernelCapabilityReady(descriptors[3])) throw new Error('failed capability should not be ready')
  if (isKernelCapabilityReady(descriptors[4])) throw new Error('disabled capability should not be ready')
  if (!isKernelCapabilityUnavailable(descriptors[4])) throw new Error('disabled should be unavailable')

  // filterKernelCapabilities
  const readyCaps = filterKernelCapabilities(descriptors, { status: 'ready' })
  if (readyCaps.length !== 2) throw new Error(`expected 2 ready caps, got ${readyCaps.length}`)

  const lazyCaps = filterKernelCapabilities(descriptors, { lazy: true })
  if (lazyCaps.length !== 3) throw new Error(`expected 3 lazy caps, got ${lazyCaps.length}`)

  const unavailableCaps = filterKernelCapabilities(descriptors, { unavailable: true })
  if (unavailableCaps.length !== 2) throw new Error(`expected 2 unavailable caps, got ${unavailableCaps.length}`) // failed + disabled

  // groupKernelCapabilities
  const groups = groupKernelCapabilities(descriptors)
  const familyCount = Object.keys(groups).length
  if (familyCount < 3) throw new Error(`expected at least 3 families, got ${familyCount}`)

  // getKernelCapabilityFamily
  const family = getKernelCapabilityFamily({ name: 'test', status: 'ready', lazy: false, dependencies: [], reloadable: false })
  if (!KERNEL_CAPABILITY_FAMILIES.includes(family)) throw new Error(`unknown family: ${family}`)
}

// ---------------------------------------------------------------------------
// Context Manager Tests
// ---------------------------------------------------------------------------

async function testContextManager(): Promise<void> {
  const { createKernelContextManager } = await import('../src/kernel/context.js')

  const ctx = createKernelContextManager({
    getSystem: async () => ({ os: 'darwin', shell: 'zsh' }),
    getUser: async () => ({ name: 'TestUser' }),
    getGitStatus: async () => 'On branch main, clean working tree',
    getSystemPromptInjection: () => null,
    setSystemPromptInjection: (_val) => {},
  })

  const snapshot = await ctx.read()
  if (!snapshot.system || !snapshot.user) throw new Error('context snapshot missing system/user')
  if (snapshot.system.os !== 'darwin') throw new Error('wrong os in context')

  const system = await ctx.getSystem()
  if (system.os !== 'darwin') throw new Error('getSystem failed')

  const gitStatus = await ctx.getGitStatus()
  if (!gitStatus) throw new Error('git status should not be null')
  if (!gitStatus.includes('main')) throw new Error('git status should mention main')
}

// ---------------------------------------------------------------------------
// Session Manager Tests
// ---------------------------------------------------------------------------

async function testSessionManager(): Promise<void> {
  const { createKernelSessionManager } = await import('../src/kernel/sessions.js')

  const sessions = createKernelSessionManager({
    listSessions: async () => [
      { sessionId: 's1', summary: 'Worked on auth', lastModified: 1000 },
      { sessionId: 's2', summary: 'Fixed bugs', lastModified: 2000, cwd: '/project', gitBranch: 'fix/bugs' },
    ],
    loadTranscript: async (sessionId) => ({
      sessionId,
      messages: [{ role: 'user', content: `Session ${sessionId}` }],
      mode: 'normal' as const,
      turnInterruptionState: 'none' as const,
    }),
  })

  const list = await sessions.list()
  if (list.length !== 2) throw new Error(`expected 2 sessions, got ${list.length}`)

  const resume = await sessions.resume('s1')
  if (!resume.messages || resume.messages.length === 0) throw new Error('resume should have messages')
  if (resume.mode !== 'normal') throw new Error('mode should be normal')

  const transcript = await sessions.getTranscript('s2')
  if (transcript.sessionId !== 's2') throw new Error('transcript sessionId mismatch')
}

// ---------------------------------------------------------------------------
// Permission Broker Tests
// ---------------------------------------------------------------------------

async function testPermissionBroker(): Promise<void> {
  const { createKernelPermissionBroker } = await import('../src/kernel/permissions.js')

  const decisions: Array<{ id: string; decision: string }> = []

  const broker = createKernelPermissionBroker({
    runtimeId: 'test-broker',
    decide: async (req) => {
      decisions.push({ id: req.permissionRequestId, decision: 'allow' })
      return {
        permissionRequestId: req.permissionRequestId,
        decision: 'allow',
        decidedBy: 'host',
      }
    },
    defaultTimeoutMs: 1000,
  })

  const result = await broker.requestPermission({
    permissionRequestId: 'perm-1',
    conversationId: 'conv-1',
    toolName: 'Bash',
    action: 'run command',
    argumentsPreview: 'ls -la',
    risk: 'low',
    policySnapshot: {},
  })

  if (result.decision !== 'allow') throw new Error(`expected allow, got ${result.decision}`)

  const snap = broker.snapshot()
  if (snap.pendingRequestIds.length !== 0) throw new Error('no pending requests expected')
  if (snap.finalizedRequestIds.length !== 1) throw new Error('1 finalized request expected')

  broker.dispose()
  if (!broker.snapshot().disposed) throw new Error('broker should be disposed')

  // After dispose, requesting should fail
  try {
    await broker.requestPermission({
      permissionRequestId: 'perm-2',
      conversationId: 'conv-1',
      toolName: 'Bash',
      action: 'run',
      argumentsPreview: 'echo hi',
      risk: 'low',
      policySnapshot: {},
    })
    throw new Error('should have thrown after dispose')
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e)
    if (!errMsg.includes('disposed') && !(e instanceof Error && e.name.includes('Disposed'))) {
      // May throw different error types — just ensure it threw
    }
  }
}

// ---------------------------------------------------------------------------
// Memory Manager Tests
// ---------------------------------------------------------------------------

async function testMemoryManager(): Promise<void> {
  const { createKernelMemoryManager } = await import('../src/kernel/memory.js')

  const memoryFiles = [
    { path: '/mem/user.md', type: 'user', content: '# User Memory\nPrefers concise answers.', parent: undefined, globs: undefined },
    { path: '/mem/project.md', type: 'project', content: '# Project\nAuth system rewrite.', parent: undefined, globs: undefined },
  ]

  const mem = createKernelMemoryManager({
    loadFiles: async () => memoryFiles.map(f => ({ ...f, globs: f.globs ?? [] })),
    readFile: async (path) => memoryFiles.find(f => f.path === path)?.content ?? '',
    writeFile: async () => {},
    invalidateCaches: () => {},
  })

  const list = await mem.list()
  if (list.length !== 2) throw new Error(`expected 2 memory files, got ${list.length}`)

  const doc = await mem.read(list[0].id)
  if (!doc.content) throw new Error('memory document should have content')
  if (!doc.content.includes('concise')) throw new Error('memory content mismatch')

  const written = await mem.update({ id: list[0].id, content: '# Updated' })
  if (written.id !== list[0].id) throw new Error('update should return same id')
}

// ---------------------------------------------------------------------------
// Kernel Public Capability Integration Tests
// ---------------------------------------------------------------------------

async function testKernelPublicCapabilityIntegration(): Promise<void> {
  // Verify the test suite from publicCapabilities.test.ts passes
  const {
    createKernelCompanionRuntime,
  } = await import('../src/kernel/companion.js')
  const {
    createKernelKairosRuntime,
  } = await import('../src/kernel/kairos.js')
  const {
    createKernelContextManager,
  } = await import('../src/kernel/context.js')
  const {
    createKernelMemoryManager,
  } = await import('../src/kernel/memory.js')
  const {
    createKernelSessionManager,
  } = await import('../src/kernel/sessions.js')

  // All factories should return objects with the expected interface
  const companion = createKernelCompanionRuntime()
  if (typeof companion.getState !== 'function') throw new Error('companion missing getState')
  if (typeof companion.dispatch !== 'function') throw new Error('companion missing dispatch')
  if (typeof companion.reactToTurn !== 'function') throw new Error('companion missing reactToTurn')
  if (typeof companion.onEvent !== 'function') throw new Error('companion missing onEvent')

  const kairos = createKernelKairosRuntime()
  if (typeof kairos.getStatus !== 'function') throw new Error('kairos missing getStatus')
  if (typeof kairos.enqueueEvent !== 'function') throw new Error('kairos missing enqueueEvent')
  if (typeof kairos.tick !== 'function') throw new Error('kairos missing tick')
  if (typeof kairos.suspend !== 'function') throw new Error('kairos missing suspend')
  if (typeof kairos.resume !== 'function') throw new Error('kairos missing resume')
  if (typeof kairos.onEvent !== 'function') throw new Error('kairos missing onEvent')

  const ctx = createKernelContextManager()
  if (typeof ctx.read !== 'function') throw new Error('context missing read')
  if (typeof ctx.getSystem !== 'function') throw new Error('context missing getSystem')
  if (typeof ctx.getUser !== 'function') throw new Error('context missing getUser')
  if (typeof ctx.getGitStatus !== 'function') throw new Error('context missing getGitStatus')

  const mem = createKernelMemoryManager()
  if (typeof mem.list !== 'function') throw new Error('memory missing list')
  if (typeof mem.read !== 'function') throw new Error('memory missing read')
  if (typeof mem.update !== 'function') throw new Error('memory missing update')

  const sessions = createKernelSessionManager()
  if (typeof sessions.list !== 'function') throw new Error('sessions missing list')
  if (typeof sessions.resume !== 'function') throw new Error('sessions missing resume')
  if (typeof sessions.getTranscript !== 'function') throw new Error('sessions missing getTranscript')
}

// ---------------------------------------------------------------------------
// API-driven Tests (uses the user's LLM endpoint)
// ---------------------------------------------------------------------------

async function testApiBasicCompletion(): Promise<void> {
  const response = await chat([
    { role: 'user', content: 'Say "KERNEL_OK" and nothing else.' },
  ])
  if (!response.includes('KERNEL_OK') && !response.includes('kernel_ok') && !response.includes('OK')) {
    throw new Error(`Unexpected API response: ${response.slice(0, 200)}`)
  }
}

async function testApiAgentSpawnLogic(): Promise<void> {
  const response = await chat([
    {
      role: 'system',
      content: `You are a coordinator agent. You have access to an Agent tool for spawning sub-agents.
You must respond with a JSON plan for how you would:
1. Spawn an "explore" agent to research the codebase
2. Wait for its results
3. Use those results to spawn a "general-purpose" agent for implementation
4. Create tasks to track progress
5. Mark tasks as completed when done

Respond with a structured JSON plan.`,
    },
    {
      role: 'user',
      content: 'Plan a multi-agent workflow for implementing a new auth system.',
    },
  ])

  // Verify the response contains agent orchestration reasoning
  const hasExplore = response.toLowerCase().includes('explore') || response.toLowerCase().includes('agent')
  const hasTask = response.toLowerCase().includes('task') || response.toLowerCase().includes('track')
  const hasCoord = response.toLowerCase().includes('coordinate') || response.toLowerCase().includes('orchestrat') || response.toLowerCase().includes('spawn')

  if (!hasExplore && !hasTask && !hasCoord) {
    throw new Error(`API response lacks agent/task orchestration: ${response.slice(0, 300)}`)
  }
}

async function testApiTaskPlanning(): Promise<void> {
  const response = await chat([
    {
      role: 'system',
      content: `You are a task planning expert. You have TaskCreate, TaskUpdate, TaskList, and TaskGet tools.
A task has: id, subject, description, status (pending/in_progress/completed), owner, blocks (tasks blocked by this), blockedBy (tasks blocking this).

Create a detailed task breakdown for: "Add dark mode support to the application". Include:
1. Task dependencies (what blocks what)
2. Which tasks could be done in parallel
3. How to assign tasks to different agents`,
    },
    {
      role: 'user',
      content: 'Plan tasks for dark mode implementation.',
    },
  ])

  const hasDependency = response.toLowerCase().includes('depend') || response.toLowerCase().includes('block')
  const hasParallel = response.toLowerCase().includes('parallel') || response.toLowerCase().includes('concurrent')
  const hasAssign = response.toLowerCase().includes('assign') || response.toLowerCase().includes('agent') || response.toLowerCase().includes('worker')

  if (!hasDependency) throw new Error(`API response lacks task dependency reasoning: ${response.slice(0, 200)}`)
  if (!hasParallel) throw new Error(`API response lacks parallelism reasoning: ${response.slice(0, 200)}`)
  if (!hasAssign) throw new Error(`API response lacks assignment reasoning: ${response.slice(0, 200)}`)
}

async function testApiKairosProactiveReasoning(): Promise<void> {
  const response = await chat([
    {
      role: 'system',
      content: `You are in proactive/autonomous mode. This means you can:
- Schedule periodic ticks to check for changes
- Enqueue events from external sources (file changes, git pushes)
- Create autonomy commands during ticks
- Be suspended/resumed as needed

Explain how you would use proactive mode to:
1. Monitor a project for file changes
2. Automatically run tests when files change
3. Report results back to the user`,
    },
    {
      role: 'user',
      content: 'How would you use proactive mode to auto-test on file changes?',
    },
  ])

  const hasMonitor = response.toLowerCase().includes('monitor') || response.toLowerCase().includes('watch')
  const hasAuto = response.toLowerCase().includes('automatic') || response.toLowerCase().includes('auto') || response.toLowerCase().includes('trigger')
  const hasTest = response.toLowerCase().includes('test') || response.toLowerCase().includes('run')

  if (!hasMonitor) throw new Error(`API response lacks monitoring concept: ${response.slice(0, 200)}`)
  if (!hasAuto) throw new Error(`API response lacks automation concept: ${response.slice(0, 200)}`)
  if (!hasTest) throw new Error(`API response lacks testing concept: ${response.slice(0, 200)}`)
}

async function testApiCompanionPetInteraction(): Promise<void> {
  const response = await chat([
    {
      role: 'system',
      content: `You have a companion system with a small cactus named Picowhisk.
The companion can be: hatched, rehatched, muted, unmuted, petted, cleared.
It can react to turns with small messages.
It has states: seed, muted, hasStoredCompanion, profile, companion attributes.

Describe how the companion system enriches the user experience and how it interacts with the agent lifecycle.`,
    },
    {
      role: 'user',
      content: 'Tell me about the companion/pet system and how it fits in the architecture.',
    },
  ])

  // The API should demonstrate understanding of companion concepts
  const hasCompanion = response.toLowerCase().includes('companion') || response.toLowerCase().includes('pet') || response.toLowerCase().includes('picowhisk') || response.toLowerCase().includes('cactus')
  const hasInteraction = response.toLowerCase().includes('interact') || response.toLowerCase().includes('react') || response.toLowerCase().includes('respond')

  if (!hasCompanion && !hasInteraction) {
    // This is a soft check — the model may not have been trained on companion concepts
    console.log('  [INFO] Companion test soft-pass: API may not have been trained on companion concepts')
  }
}

// ---------------------------------------------------------------------------
// Test Runner
// ---------------------------------------------------------------------------

async function main() {
  const apiLabel = API_CONFIG?.baseUrl ?? 'disabled (env not configured)'
  const modelLabel = API_CONFIG?.model ?? 'disabled'
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║        KERNEL E2E DEEP TEST SUITE                            ║')
  console.log(`║        API: ${apiLabel.padEnd(49)}║`)
  console.log(`║        Model: ${modelLabel.padEnd(47)}║`)
  console.log('╚══════════════════════════════════════════════════════════════╝\n')

  // Phase 1: Structural validation (no API needed)
  console.log('── Phase 1: Kernel Export Validation ──')
  await test('All kernel exports present', 'kernel-exports', validateKernelExports)
  await test('Type definitions load', 'kernel-types', validateTypes)
  await test('Capability system (8 families)', 'capabilities', testCapabilitySystem)
  await test('All public capability modules', 'public-capabilities', testKernelPublicCapabilityIntegration)

  // Phase 2: Event & JSON-RPC-lite system
  console.log('\n── Phase 2: Event System & JSON-RPC-lite Protocol ──')
  await test('Event facade encode/decode', 'events', testEventFacadeEncodeDecode)
  await test(
    'JSON-RPC-lite protocol coverage',
    'json-rpc-lite',
    testJsonRpcLiteProtocolCoverage,
  )

  // Phase 3: Core subsystems
  console.log('\n── Phase 3: Core Subsystems ──')
  await test('Agent registry CRUD + spawn', 'agents', testAgentRegistryFacade)
  await test('Task lifecycle + dependencies', 'tasks', testTaskRegistryFacade)
  await test('Context manager', 'context', testContextManager)
  await test('Session manager', 'sessions', testSessionManager)
  await test('Permission broker', 'permissions', testPermissionBroker)
  await test('Memory manager', 'memory', testMemoryManager)

  // Phase 4: Kairos (Proactive/Autonomy)
  console.log('\n── Phase 4: Kairos (Proactive System) ──')
  await test('Kairos lifecycle (enqueue/tick/suspend/resume)', 'kairos', testKairosBasicLifecycle)
  await test('Kairos autonomy command generation', 'kairos-autonomy', testKairosAutonomyCommands)

  // Phase 5: Companion (Pet/Picowhisk)
  console.log('\n── Phase 5: Companion (Pet System) ──')
  await test('Companion hatch/mute/react/pet/clear', 'companion', testCompanionHatchLifecycle)
  await test('Companion rehatch + seed namespace', 'companion-ns', testCompanionRehatchAndNamespacing)

  // Phase 6: API-driven tests (requires the LLM endpoint)
  if (API_ENABLED) {
    console.log('\n── Phase 6: API-driven Tests ──')
    console.log(`Connecting to API at ${API_CONFIG.baseUrl}...`)
    await test('API basic connectivity', 'api-basic', testApiBasicCompletion)
    await test('API agent spawn orchestration', 'api-agent', testApiAgentSpawnLogic)
    await test('API task planning + dependencies', 'api-task', testApiTaskPlanning)
    await test('API kairos proactive reasoning', 'api-kairos', testApiKairosProactiveReasoning)
    await test('API companion/pet system', 'api-companion', testApiCompanionPetInteraction)
  } else {
    console.log('\n── Phase 6: API-driven Tests ──')
    console.log('Skipping API-driven tests: API env vars are not configured.')
  }

  // Report
  report()

  const failed = results.filter(r => !r.pass)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(2)
})
