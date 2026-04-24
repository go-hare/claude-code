export interface RuntimeSessionLifecycle {
  id: string
  workDir: string
  isLive: boolean
  stopAndWait(force?: boolean): Promise<void>
}

export interface RuntimeSessionSink<TMessage = unknown> {
  send(message: TMessage): unknown
}

export interface AttachableRuntimeSession<
  TSink extends RuntimeSessionSink<unknown> = RuntimeSessionSink,
> extends RuntimeSessionLifecycle {
  attachSink(sink: TSink): void
  detachSink(sink: TSink): void
}

export interface RuntimeSessionIndexEntry {
  sessionId: string
  transcriptSessionId: string
  cwd: string
  permissionMode?: string
  createdAt: number
  lastActiveAt: number
}

export type RuntimeSessionIndex = Record<string, RuntimeSessionIndexEntry>

export interface RuntimeSessionIndexStore {
  load(): Promise<RuntimeSessionIndex>
  list(): Promise<Array<[string, RuntimeSessionIndexEntry]>>
  upsert(key: string, entry: RuntimeSessionIndexEntry): Promise<void>
  remove(key: string): Promise<void>
}

export interface IndexedRuntimeSession extends RuntimeSessionLifecycle {
  toIndexEntry(): RuntimeSessionIndexEntry
}
