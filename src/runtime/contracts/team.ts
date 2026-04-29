export type RuntimeTeamMemberDescriptor = {
  agentId: string
  name: string
  agentType?: string
  model?: string
  color?: string
  joinedAt: number
  cwd: string
  tmuxPaneId?: string
  worktreePath?: string
  sessionId?: string
  backendType?: string
  isActive?: boolean
  mode?: string
}

export interface RuntimeTeamDescriptor {
  teamName: string
  description?: string
  taskListId: string
  teamFilePath: string
  createdAt: number
  leadAgentId: string
  leadSessionId?: string
  memberCount: number
  activeMemberCount: number
  members: readonly RuntimeTeamMemberDescriptor[]
}

export interface RuntimeTeamListSnapshot {
  teams: readonly RuntimeTeamDescriptor[]
}

export interface RuntimeTeamCreateRequest {
  teamName: string
  description?: string
  leadAgentType?: string
  leadModel?: string
  workspacePath?: string
  leadSessionId?: string
  allowRename?: boolean
}

export interface RuntimeTeamCreateResult {
  created: boolean
  team: RuntimeTeamDescriptor
  requestedTeamName?: string
  message?: string
}

export interface RuntimeTeamMessageRequest {
  teamName: string
  recipient: string | '*'
  message: string
  summary?: string
  sender?: string
}

export interface RuntimeTeamMessageResult {
  success: boolean
  teamName: string
  recipients: readonly string[]
  message: string
}

export interface RuntimeTeamDestroyRequest {
  teamName: string
  force?: boolean
}

export interface RuntimeTeamDestroyResult {
  success: boolean
  teamName: string
  message: string
  blockedMembers?: readonly string[]
}
