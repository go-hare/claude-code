import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import { getSkillsPath } from "../loadSkillsDir";

describe("getSkillsPath", () => {
  const savedClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const savedProjectConfigDirName =
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;

  afterEach(() => {
    if (savedClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = savedClaudeConfigDir;

    if (savedProjectConfigDirName === undefined)
      delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;
    else process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = savedProjectConfigDirName;
  });

  test("uses configured project config dir for project skills", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(getSkillsPath("projectSettings", "skills")).toBe(
      join(".hare", "skills"),
    );
  });

  test("uses configured project config dir for policy commands", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(
      getSkillsPath("policySettings", "commands").endsWith(
        join(".hare", "commands"),
      ),
    ).toBe(true);
  });

  test("keeps user settings path on CLAUDE_CONFIG_DIR", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/hare-home";
    expect(getSkillsPath("userSettings", "skills")).toBe(
      join("/tmp/hare-home", "skills"),
    );
  });
});
