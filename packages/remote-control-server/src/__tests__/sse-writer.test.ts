import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock config
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-api-key"],
  baseUrl: "http://localhost:3000",
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { Hono } from "hono";
import { storeReset } from "../store";
import { removeEventBus, getAllEventBuses, getEventBus } from "../transport/event-bus";
import { createSSEWriter, createSSEStream, createWorkerEventStream } from "../transport/sse-writer";

function createAgentCoreEvent(sequence = 1) {
  return {
    id: `agent-event-${sequence}`,
    sequence,
    timestamp: "2026-05-10T00:00:00.000Z",
    sessionId: "session-1",
    turnId: "turn-1",
    type: "message.delta",
    messageId: "message-1",
    text: "hello",
  };
}

function parseSSEDataFrame(text: string): Record<string, unknown> {
  const line = text.split("\n").find((line) => line.startsWith("data: "));
  if (!line) throw new Error(`Missing data line in SSE frame: ${text}`);
  return JSON.parse(line.slice("data: ".length)) as Record<string, unknown>;
}

/** Read up to N bytes from a Response stream, then cancel */
async function readPartialStream(res: Response, maxBytes = 4096): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalBytes += value.length;
      // Cancel after we have some data (first keepalive + any initial events)
      if (totalBytes > 0) break;
    }
  } finally {
    reader.cancel();
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(combined);
}

describe("SSE Writer", () => {
  describe("createSSEWriter", () => {
    test("creates SSEWriter with send and close methods", () => {
      const app = new Hono();
      let capturedWriter: ReturnType<typeof createSSEWriter> | null = null;

      app.get("/test", (c) => {
        capturedWriter = createSSEWriter(c);
        return c.text("ok");
      });

      app.request("/test");
      expect(capturedWriter).not.toBeNull();
      expect(typeof capturedWriter!.send).toBe("function");
      expect(typeof capturedWriter!.close).toBe("function");
    });
  });

  describe("createSSEStream", () => {
    beforeEach(() => {
      storeReset();
      for (const [key] of getAllEventBuses()) {
        removeEventBus(key);
      }
    });

    test("returns Response with correct SSE headers", async () => {
      const app = new Hono();

      app.get("/stream/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        return createSSEStream(c, sessionId, 0);
      });

      const res = await app.request("/stream/s1");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/event-stream");
      expect(res.headers.get("Cache-Control")).toBe("no-cache");
      expect(res.headers.get("Connection")).toBe("keep-alive");
      expect(res.headers.get("X-Accel-Buffering")).toBe("no");

      // Cancel the stream
      res.body?.cancel();
    });

    test("sends initial keepalive", async () => {
      const app = new Hono();

      app.get("/stream/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        return createSSEStream(c, sessionId, 0);
      });

      const res = await app.request("/stream/s2");
      const text = await readPartialStream(res);
      expect(text).toContain(": keepalive");
    });

    test("sends historical events when fromSeqNum > 0", async () => {
      // Pre-populate event bus with events
      const bus = getEventBus("s3");
      bus.publish({ id: "e1", sessionId: "s3", type: "user", payload: { content: "hello" }, direction: "outbound" });
      bus.publish({ id: "e2", sessionId: "s3", type: "assistant", payload: { content: "hi" }, direction: "inbound" });

      const app = new Hono();

      app.get("/stream/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        const fromSeq = parseInt(c.req.query("fromSeq") || "0");
        return createSSEStream(c, sessionId, fromSeq);
      });

      const res = await app.request("/stream/s3?fromSeq=1");
      const text = await readPartialStream(res);
      // Should replay events since seq 1 (i.e., event 2)
      expect(text).toContain('"seqNum":2');
      expect(text).toContain("assistant");
    });

    test("no historical events when fromSeqNum is 0", async () => {
      const bus = getEventBus("s5");
      bus.publish({ id: "e1", sessionId: "s5", type: "user", payload: {}, direction: "outbound" });

      const app = new Hono();

      app.get("/stream/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        return createSSEStream(c, sessionId, 0);
      });

      const res = await app.request("/stream/s5");
      const text = await readPartialStream(res);
      // With fromSeqNum=0, no historical replay, just keepalive
      expect(text).toContain(": keepalive");
      // Should NOT contain event data (only keepalive)
      expect(text).not.toContain("event: message");
    });

    test("subscribes to new events and delivers them", async () => {
      const app = new Hono();

      app.get("/stream/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        return createSSEStream(c, sessionId, 0);
      });

      const res = await app.request("/stream/s6");

      // Read initial keepalive first
      const reader = res.body!.getReader();
      const { value: firstChunk } = await reader.read();
      const initialText = new TextDecoder().decode(firstChunk!);
      expect(initialText).toContain(": keepalive");

      // Now publish an event
      const bus = getEventBus("s6");
      bus.publish({ id: "e1", sessionId: "s6", type: "user", payload: { content: "real-time" }, direction: "outbound" });

      // Read the event
      const { value: secondChunk } = await reader.read();
      const eventText = new TextDecoder().decode(secondChunk!);
      expect(eventText).toContain("event: message");
      expect(eventText).toContain("real-time");

      reader.cancel();
    });
  });

  describe("createWorkerEventStream", () => {
    beforeEach(() => {
      storeReset();
      for (const [key] of getAllEventBuses()) {
        removeEventBus(key);
      }
    });

    test("preserves Agent Core events in client_event payloads", async () => {
      const app = new Hono();
      const event = createAgentCoreEvent();

      app.get("/worker/:sessionId", (c) => {
        const sessionId = c.req.param("sessionId");
        return createWorkerEventStream(c, sessionId, 0);
      });

      const res = await app.request("/worker/s-runtime");
      const reader = res.body!.getReader();
      const { value: keepaliveChunk } = await reader.read();
      expect(new TextDecoder().decode(keepaliveChunk!)).toContain(": keepalive");

      const bus = getEventBus("s-runtime");
      bus.publish({
        id: "runtime-eventbus-id",
        sessionId: "s-runtime",
        type: "agent_core_event",
        payload: { raw: event },
        direction: "outbound",
      });

      const { value: eventChunk } = await reader.read();
      const frame = parseSSEDataFrame(new TextDecoder().decode(eventChunk!));
      const payload = frame.payload as Record<string, unknown>;

      expect(frame.event_type).toBe("agent_core_event");
      expect(payload.type).toBe("agent_core_event");
      expect(payload.event).toEqual(event);
      expect(payload.message).toBeUndefined();

      reader.cancel();
    });
  });
});
