import { describe, expect, test } from "bun:test";

import type { Message } from "../../types/message";
import {
  createAssistantMessage,
  createUserMessage,
} from "../messages";
import {
  applyToolProgressTrackingUpdate,
  createToolProgressTrackingState,
  projectProgressMessageToProtocolMessageProjection,
  projectProgressMessageToProtocolMessages,
} from "../queryHelpers";

function createProgressMessage(
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Message {
  return {
    type: "progress",
    uuid: "00000000-0000-4000-8000-000000000100",
    parentToolUseID: "toolu_parent",
    toolUseID: "toolu_child",
    data,
    ...overrides,
  } as unknown as Message;
}

describe("projectProgressMessageToProtocolMessages", () => {
  test("projects agent progress assistant payloads with parent tool use id", () => {
    const nested = createAssistantMessage({ content: "agent update" });
    const messages = projectProgressMessageToProtocolMessages(
      createProgressMessage({
        type: "agent_progress",
        message: nested,
        elapsedTimeSeconds: 3,
        taskId: "task-1",
      }),
      {
        sessionId: "session-1",
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "assistant",
      parent_tool_use_id: "toolu_parent",
      session_id: "session-1",
      message: {
        content: [{ type: "text", text: "agent update" }],
      },
    });
  });

  test("projects skill progress user payloads with synthetic metadata", () => {
    const nested = createUserMessage({
      content: "user progress",
      isMeta: true,
    });
    const messages = projectProgressMessageToProtocolMessages(
      createProgressMessage({
        type: "skill_progress",
        message: nested,
        elapsedTimeSeconds: 4,
        taskId: "task-2",
      }),
      {
        sessionId: "session-2",
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      type: "user",
      parent_tool_use_id: "toolu_parent",
      session_id: "session-2",
      isSynthetic: true,
      message: {
        content: [{ type: "text", text: "user progress" }],
      },
    });
  });

  test("throttles bash progress with external tracking state", () => {
    const trackingState = createToolProgressTrackingState();
    const progressMessage = createProgressMessage(
      {
        type: "bash_progress",
        elapsedTimeSeconds: 8,
        taskId: "task-3",
        message: createAssistantMessage({ content: "ignored" }),
      },
      {
        uuid: "00000000-0000-4000-8000-000000000101",
      },
    );

    const first = projectProgressMessageToProtocolMessages(progressMessage, {
      now: 30_000,
      remoteEnabled: true,
      sessionId: "session-3",
      trackingState,
    });
    const second = projectProgressMessageToProtocolMessages(progressMessage, {
      now: 31_000,
      remoteEnabled: true,
      sessionId: "session-3",
      trackingState,
    });
    const third = projectProgressMessageToProtocolMessages(progressMessage, {
      now: 60_001,
      remoteEnabled: true,
      sessionId: "session-3",
      trackingState,
    });

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: "tool_progress",
      tool_name: "Bash",
      session_id: "session-3",
    });
    expect(second).toEqual([]);
    expect(third).toHaveLength(1);
  });

  test("skips tool progress when remote delivery is disabled", () => {
    const trackingState = createToolProgressTrackingState();
    const progressMessage = createProgressMessage({
      type: "powershell_progress",
      elapsedTimeSeconds: 6,
      taskId: "task-4",
      message: createAssistantMessage({ content: "ignored" }),
    });

    const messages = projectProgressMessageToProtocolMessages(progressMessage, {
      remoteEnabled: false,
      sessionId: "session-4",
      trackingState,
    });

    expect(messages).toEqual([]);
    expect(
      trackingState.lastSentTimeByParentToolUseId.size,
    ).toBe(0);
  });

  test("pure tool progress projection reports tracking updates separately", () => {
    const trackingState = createToolProgressTrackingState();
    const progressMessage = createProgressMessage({
      type: "bash_progress",
      elapsedTimeSeconds: 5,
      taskId: "task-5",
      message: createAssistantMessage({ content: "ignored" }),
    });

    const projection = projectProgressMessageToProtocolMessageProjection(
      progressMessage,
      {
        now: 30_000,
        remoteEnabled: true,
        sessionId: "session-5",
        trackingState,
      },
    );

    expect(projection.messages).toHaveLength(1);
    expect(projection.trackingUpdate).toEqual({
      trackingKey: "toolu_parent",
      sentAt: 30_000,
    });
    expect(trackingState.lastSentTimeByParentToolUseId.size).toBe(0);

    applyToolProgressTrackingUpdate(
      trackingState,
      projection.trackingUpdate!,
    );
    expect(
      trackingState.lastSentTimeByParentToolUseId.get("toolu_parent"),
    ).toBe(30_000);
  });
});
