/** SDK 消息类型 — 与 CC CLI bridge 模块兼容 */
export interface ProtocolMessage {
  type: string;
  content?: unknown;
  [key: string]: unknown;
}

export interface UserMessage extends ProtocolMessage {
  type: "user";
  content: string;
}

export interface AssistantMessage extends ProtocolMessage {
  type: "assistant";
  content: string;
}

export interface PermissionRequest extends ProtocolMessage {
  type: "permission_request";
  tool_name: string;
  tool_input: unknown;
}

export interface PermissionResponse extends ProtocolMessage {
  type: "permission_response";
  approved: boolean;
  request_id: string;
}

export interface ControlRequest extends ProtocolMessage {
  type: "control_request";
  action: string;
  [key: string]: unknown;
}

export type SessionEventType =
  | "user"
  | "assistant"
  | "automation_state"
  | "permission_request"
  | "permission_response"
  | "control_request"
  | "tool_use"
  | "tool_result"
  | "status"
  | "error";

// --- Normalized Event Payloads (SSE contract) ---

export interface NormalizedEventPayload {
  content: string;
  raw?: unknown;
  isSynthetic?: boolean;
  [key: string]: unknown;
}

export interface UserEventPayload extends NormalizedEventPayload {
  content: string;
}

export interface AssistantEventPayload extends NormalizedEventPayload {
  content: string;
}

export interface ToolUseEventPayload extends NormalizedEventPayload {
  content: string;
  tool_name: string;
  tool_input: unknown;
}

export interface ToolResultEventPayload extends NormalizedEventPayload {
  content: string;
}

export interface PermissionEventPayload extends NormalizedEventPayload {
  content: string;
  request_id: string;
  request: {
    subtype: string;
    tool_name: string;
    tool_input: unknown;
  };
}
