import { describe, expect, test } from "bun:test";
import {
  authTokensEqual,
  decodeWebSocketAuthProtocol,
  encodeWebSocketAuthProtocol,
  extractWebSocketAuthToken,
} from "../ws-auth.js";
import {
  decodeJsonWsMessage,
  MAX_CLIENT_WS_PAYLOAD_BYTES,
} from "../ws-message.js";
import { buildRcsWsUrl } from "../rcs-upstream.js";

describe("WebSocket auth protocol", () => {
  test("round-trips tokens through a WebSocket subprotocol token", () => {
    const protocol = encodeWebSocketAuthProtocol("secret/token+with=symbols");
    expect(protocol).toStartWith("rcs.auth.");
    expect(protocol).not.toContain("secret/token");
    expect(decodeWebSocketAuthProtocol(protocol)).toBe(
      "secret/token+with=symbols",
    );
  });

  test("prefers Authorization headers and supports protocol auth", () => {
    expect(
      extractWebSocketAuthToken({
        authorization: "Bearer header-token",
        protocol: encodeWebSocketAuthProtocol("protocol-token"),
      }),
    ).toBe("header-token");
    expect(
      extractWebSocketAuthToken({
        protocol: encodeWebSocketAuthProtocol("protocol-token"),
      }),
    ).toBe("protocol-token");
  });

  test("compares auth tokens through the constant-time path", () => {
    expect(authTokensEqual("secret-token", "secret-token")).toBe(true);
    expect(authTokensEqual("secret-token", "wrong-token")).toBe(false);
    expect(authTokensEqual(undefined, "secret-token")).toBe(false);
  });
});

describe("WebSocket message decoding", () => {
  test("decodes supported payload shapes", () => {
    expect(decodeJsonWsMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(
      decodeJsonWsMessage(Buffer.from('{"type":"prompt","payload":{"content":[]}}')),
    ).toEqual({ type: "prompt", payload: { content: [] } });
    expect(
      decodeJsonWsMessage(new TextEncoder().encode('{"type":"cancel"}').buffer),
    ).toEqual({ type: "cancel" });
  });

  test("rejects oversized payloads before parsing", () => {
    const payload = "x".repeat(MAX_CLIENT_WS_PAYLOAD_BYTES + 1);
    expect(() => decodeJsonWsMessage(payload)).toThrow(
      "WebSocket message too large",
    );
  });
});

describe("RCS upstream URL normalization", () => {
  test("removes legacy token query params from WebSocket URLs", () => {
    expect(
      buildRcsWsUrl("http://example.test/acp/ws?token=old-secret&x=1"),
    ).toBe("ws://example.test/acp/ws?x=1");
  });

  test("adds /acp/ws for base URLs", () => {
    expect(buildRcsWsUrl("https://example.test/")).toBe(
      "wss://example.test/acp/ws",
    );
  });
});
