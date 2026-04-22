import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { getRelativeSettingsFilePathForSource } from "../settings";

describe("settings path helpers", () => {
  const savedProjectConfigDirName = process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;

  afterEach(() => {
    if (savedProjectConfigDirName === undefined)
      delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;
    else process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = savedProjectConfigDirName;
  });

  test("defaults project settings path to .claude", () => {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;
    expect(getRelativeSettingsFilePathForSource("projectSettings")).toBe(
      join(".claude", "settings.json"),
    );
  });

  test("uses configured project config dir for local settings path", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(getRelativeSettingsFilePathForSource("localSettings")).toBe(
      join(".hare", "settings.local.json"),
    );
  });
});
