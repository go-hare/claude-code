import type { SessionEvent } from "./event-bus";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAgentCoreEvent(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sequence === "number" &&
    typeof value.timestamp === "string" &&
    typeof value.type === "string"
  );
}

function extractAgentCoreEvent(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isAgentCoreEvent(value.event)) return value.event;
  if (isAgentCoreEvent(value)) return value;

  const container: Record<string, unknown> = value;
  const raw = container.raw;
  if (isAgentCoreEvent(raw)) return raw;
  if (isRecord(raw) && isAgentCoreEvent(raw.event)) return raw.event;

  const message = container.message;
  if (isAgentCoreEvent(message)) return message;
  if (isRecord(message) && isAgentCoreEvent(message.event)) return message.event;

  return undefined;
}

/**
 * Convert an internal session event into the SDK/control message shape that
 * bridge workers consume on both the WS path and the v2 worker SSE path.
 */
export function toClientPayload(event: SessionEvent): Record<string, unknown> {
  const payload = event.payload as Record<string, unknown> | null;
  const messageUuid =
    typeof payload?.uuid === "string" && payload.uuid ? payload.uuid : event.id;

  if (event.type === "agent_core_event") {
    const agentEvent = extractAgentCoreEvent(payload);
    return {
      type: "agent_core_event",
      uuid: messageUuid,
      session_id: event.sessionId,
      ...(agentEvent ? { event: agentEvent } : { message: payload ?? {} }),
    };
  }

  if (event.type === "user" || event.type === "user_message") {
    return {
      type: "user",
      uuid: messageUuid,
      session_id: event.sessionId,
      ...(payload?.isSynthetic === true ? { isSynthetic: true } : {}),
      message: {
        role: "user",
        content: payload?.content ?? payload?.message ?? "",
      },
    };
  }

  if (event.type === "permission_response" || event.type === "control_response") {
    const approved = !!payload?.approved;
    const existingResponse = payload?.response as Record<string, unknown> | undefined;
    if (existingResponse) {
      return { type: "control_response", response: existingResponse };
    }

    const updatedInput = payload?.updated_input as Record<string, unknown> | undefined;
    const updatedPermissions = payload?.updated_permissions as Record<string, unknown>[] | undefined;
    const feedbackMessage = payload?.message as string | undefined;

    return {
      type: "control_response",
      response: {
        subtype: approved ? "success" : "error",
        request_id: payload?.request_id ?? "",
        ...(approved
          ? {
              response: {
                behavior: "allow" as const,
                ...(updatedInput ? { updatedInput } : {}),
                ...(updatedPermissions ? { updatedPermissions } : {}),
              },
            }
          : {
              error: "Permission denied by user",
              response: { behavior: "deny" as const },
              ...(feedbackMessage ? { message: feedbackMessage } : {}),
            }),
      },
    };
  }

  if (event.type === "interrupt") {
    return {
      type: "control_request",
      request_id: event.id,
      request: { subtype: "interrupt" },
    };
  }

  if (event.type === "control_request") {
    return {
      type: "control_request",
      request_id: payload?.request_id ?? event.id,
      request: payload?.request ?? payload,
    };
  }

  return {
    type: event.type,
    uuid: messageUuid,
    session_id: event.sessionId,
    message: payload,
  };
}
