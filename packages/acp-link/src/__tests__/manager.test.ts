import { describe, expect, test } from "bun:test";
import { resolveSelfLaunchCommand } from "../manager/manager.js";

describe("resolveSelfLaunchCommand", () => {
  test("uses local source CLI through bun in source mode", () => {
    const command = resolveSelfLaunchCommand({
      execPath: "C:\\Users\\Administrator\\.bun\\bin\\bun.exe",
      moduleUrl: "file:///C:/repo/packages/acp-link/src/manager/manager.ts",
      fileExists: (path) => path.endsWith("/src/cli/bin.ts") || path.endsWith("\\src\\cli\\bin.ts"),
    });

    expect(command).toEqual([
      "C:\\Users\\Administrator\\.bun\\bin\\bun.exe",
      "run",
      "C:\\repo\\packages\\acp-link\\src\\cli\\bin.ts",
    ]);
  });

  test("falls back to built CLI when bun source entry is unavailable", () => {
    const command = resolveSelfLaunchCommand({
      execPath: "C:\\Users\\Administrator\\.bun\\bin\\bun.exe",
      moduleUrl: "file:///C:/repo/packages/acp-link/dist/manager/manager.js",
      fileExists: (path) => path.endsWith("/dist/cli/bin.js") || path.endsWith("\\dist\\cli\\bin.js"),
    });

    expect(command).toEqual([
      "C:\\Users\\Administrator\\.bun\\bin\\bun.exe",
      "run",
      "C:\\repo\\packages\\acp-link\\dist\\cli\\bin.js",
    ]);
  });

  test("uses the built CLI directly under node", () => {
    const command = resolveSelfLaunchCommand({
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      moduleUrl: "file:///C:/repo/packages/acp-link/dist/manager/manager.js",
      fileExists: (path) => path.endsWith("/dist/cli/bin.js") || path.endsWith("\\dist\\cli\\bin.js"),
    });

    expect(command).toEqual([
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\repo\\packages\\acp-link\\dist\\cli\\bin.js",
    ]);
  });

  test("falls back to global acp-link when no local entry exists", () => {
    const command = resolveSelfLaunchCommand({
      execPath: "C:\\Program Files\\nodejs\\node.exe",
      moduleUrl: "file:///C:/repo/packages/acp-link/dist/manager/manager.js",
      fileExists: () => false,
    });

    expect(command).toEqual(["acp-link"]);
  });
});
