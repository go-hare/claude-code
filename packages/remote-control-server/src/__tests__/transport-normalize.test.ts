import { describe, test, expect } from "bun:test";

const { normalizePayload } = await import("../services/transport");

function createRuntimeEnvelope(sequence = 1) {
  return {
    schemaVersion: "kernel.runtime.v1",
    messageId: `runtime-message-${sequence}`,
    eventId: `runtime-event-${sequence}`,
    sequence,
    timestamp: "2026-04-26T00:00:00.000Z",
    source: "kernel_runtime",
    kind: "event",
    conversationId: "conversation-1",
    payload: { type: "headless.protocol_message" },
  };
}

// extractContent is not exported; we test it via normalizePayload's content field

// =============================================================================
// extractContent (via normalizePayload content field)
// =============================================================================

describe("extractContent", () => {
  test("returns empty string for null payload", () => {
    const result = normalizePayload("assistant", null);
    expect(result.content).toBe("");
  });

  test("returns empty string for undefined payload", () => {
    const result = normalizePayload("assistant", undefined);
    expect(result.content).toBe("");
  });

  test("returns the string for string payload", () => {
    const result = normalizePayload("assistant", "hello world");
    expect(result.content).toBe("hello world");
  });

  test("extracts content field from object payload", () => {
    const result = normalizePayload("assistant", { content: "direct content" });
    expect(result.content).toBe("direct content");
  });

  test("extracts message.content string from object payload", () => {
    const result = normalizePayload("assistant", { message: { content: "msg content" } });
    expect(result.content).toBe("msg content");
  });

  test("extracts text blocks from message.content array", () => {
    const payload = {
      message: {
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "World" },
        ],
      },
    };
    const result = normalizePayload("assistant", payload);
    expect(result.content).toBe("Hello World");
  });

  test("ignores non-text blocks in message.content array", () => {
    const payload = {
      message: {
        content: [
          { type: "image", url: "http://example.com/img.png" },
          { type: "text", text: "only this" },
        ],
      },
    };
    const result = normalizePayload("assistant", payload);
    expect(result.content).toBe("only this");
  });

  test("returns empty string when no extractable content", () => {
    const result = normalizePayload("assistant", { foo: "bar" });
    expect(result.content).toBe("");
  });

  test("prefers direct content over message.content", () => {
    const result = normalizePayload("assistant", { content: "direct", message: { content: "nested" } });
    expect(result.content).toBe("direct");
  });
});

// =============================================================================
// normalizePayload — field preservation
// =============================================================================

describe("normalizePayload — field preservation", () => {
  test("preserves raw payload", () => {
    const payload = { content: "test", extra: true };
    const result = normalizePayload("assistant", payload);
    expect(result.raw).toBe(payload);
  });

  test("preserves uuid field", () => {
    const result = normalizePayload("assistant", { uuid: "u-123" });
    expect(result.uuid).toBe("u-123");
  });

  test("does not preserve uuid when empty string", () => {
    const result = normalizePayload("assistant", { uuid: "" });
    expect(result.uuid).toBeUndefined();
  });

  test("preserves isSynthetic boolean", () => {
    const result = normalizePayload("assistant", { isSynthetic: true });
    expect(result.isSynthetic).toBe(true);
  });

  test("preserves status string", () => {
    const result = normalizePayload("assistant", { status: "running" });
    expect(result.status).toBe("running");
  });

  test("preserves subtype string", () => {
    const result = normalizePayload("assistant", { subtype: "progress" });
    expect(result.subtype).toBe("progress");
  });

  test("preserves tool_name from tool_name field", () => {
    const result = normalizePayload("tool", { tool_name: "bash" });
    expect(result.tool_name).toBe("bash");
  });

  test("preserves tool_name from name field", () => {
    const result = normalizePayload("tool", { name: "read" });
    expect(result.tool_name).toBe("read");
  });

  test("preserves tool_input from tool_input field", () => {
    const input = { command: "ls" };
    const result = normalizePayload("tool", { tool_input: input });
    expect(result.tool_input).toEqual(input);
  });

  test("preserves tool_input from input field", () => {
    const input = { path: "/tmp" };
    const result = normalizePayload("tool", { input });
    expect(result.tool_input).toEqual(input);
  });

  test("preserves request_id", () => {
    const result = normalizePayload("permission", { request_id: "req-1" });
    expect(result.request_id).toBe("req-1");
  });

  test("preserves request object", () => {
    const req = { subtype: "permission" };
    const result = normalizePayload("permission", { request: req });
    expect(result.request).toEqual(req);
  });

  test("preserves approved field", () => {
    const result = normalizePayload("permission", { approved: true });
    expect(result.approved).toBe(true);
  });

  test("preserves updated_input", () => {
    const input = { command: "rm -rf" };
    const result = normalizePayload("permission", { updated_input: input });
    expect(result.updated_input).toEqual(input);
  });

  test("preserves message field for backward compat", () => {
    const msg = { role: "user", content: "hi" };
    const result = normalizePayload("assistant", { message: msg });
    expect(result.message).toEqual(msg);
  });

  test("preserves kernel runtime envelope as first-class payload field", () => {
    const envelope = createRuntimeEnvelope();
    const result = normalizePayload("kernel_runtime_event", {
      type: "kernel_runtime_event",
      uuid: "wire-message-1",
      envelope,
    });

    expect(result.content).toBe("");
    expect(result.uuid).toBe("wire-message-1");
    expect(result.envelope).toEqual(envelope);
  });

  test("wraps bare kernel runtime envelope payloads", () => {
    const envelope = createRuntimeEnvelope(2);
    const result = normalizePayload("kernel_runtime_event", envelope);

    expect(result.envelope).toEqual(envelope);
  });

  test("preserves runtime envelopes stored under raw compatibility payloads", () => {
    const envelope = createRuntimeEnvelope(3);
    const result = normalizePayload("kernel_runtime_event", { raw: envelope });

    expect(result.envelope).toEqual(envelope);
  });
});

// =============================================================================
// normalizePayload — task_state special handling
// =============================================================================

describe("normalizePayload — task_state type", () => {
  test("preserves task_list_id (snake_case)", () => {
    const result = normalizePayload("task_state", { task_list_id: "tl-1" });
    expect(result.task_list_id).toBe("tl-1");
  });

  test("preserves taskListId (camelCase)", () => {
    const result = normalizePayload("task_state", { taskListId: "tl-2" });
    expect(result.taskListId).toBe("tl-2");
  });

  test("preserves tasks array", () => {
    const tasks = [{ id: "t1", title: "Task 1" }];
    const result = normalizePayload("task_state", { tasks });
    expect(result.tasks).toEqual(tasks);
  });

  test("does not preserve task fields for non-task_state type", () => {
    const result = normalizePayload("assistant", { task_list_id: "tl-1", taskListId: "tl-2", tasks: [] });
    expect(result.task_list_id).toBeUndefined();
    expect(result.taskListId).toBeUndefined();
    expect(result.tasks).toBeUndefined();
  });
});
