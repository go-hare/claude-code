export interface RuntimeSessionLifecycle {
  id: string
  workDir: string
  isLive: boolean
  stopAndWait(force?: boolean): Promise<void>
}
