import { describe, expect, test } from "bun:test";
import { createApp } from "../manager/routes.js";

describe("manager routes", () => {
  test("GET /health returns ok before the catch-all route", async () => {
    const app = createApp({
      list: () => [],
      create: () => {
        throw new Error("not used");
      },
      get: () => undefined,
      subscribe: () => () => {},
      stop: () => false,
      remove: () => false,
    } as any);

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
