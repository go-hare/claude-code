import { afterEach, describe, expect, test } from "bun:test";
import { join } from "path";
import {
  DEFAULT_PROJECT_CONFIG_DIR_NAME,
  getProjectConfigDirDisplayPath,
  getProjectConfigDir,
  getProjectConfigDirName,
  getUserConfigHomeDir,
  getUserConfigHomeDisplayPath,
  joinUserConfigDisplayPath,
  joinProjectConfigPath,
} from "../configPaths";

describe("configPaths", () => {
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

  test("uses CLAUDE_CONFIG_DIR when set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/test-hare";
    expect(getUserConfigHomeDir()).toBe("/tmp/test-hare");
  });

  test("defaults user config home to hidden config dir", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(getUserConfigHomeDir()).toMatch(/\.claude$/);
  });

  test("defaults project config dir name to .claude", () => {
    delete process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME;
    expect(getProjectConfigDirName()).toBe(DEFAULT_PROJECT_CONFIG_DIR_NAME);
  });

  test("uses CLAUDE_PROJECT_CONFIG_DIR_NAME when set", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(getProjectConfigDirName()).toBe(".hare");
  });

  test("builds project config dir from cwd", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(getProjectConfigDir("repo")).toBe(join("repo", ".hare"));
  });

  test("builds a display path for the project config dir", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(getProjectConfigDirDisplayPath("skills")).toBe(".hare/skills");
  });

  test("joins project config subpaths from cwd", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare";
    expect(joinProjectConfigPath("repo", "skills")).toBe(
      join("repo", ".hare", "skills"),
    );
  });

  test("renders user config display path under home with tilde", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(getUserConfigHomeDisplayPath()).toBe("~/.claude");
    expect(joinUserConfigDisplayPath("teams", "alpha")).toBe(
      "~/.claude/teams/alpha",
    );
  });

  test("renders a custom user config display path", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/test-hare";
    expect(getUserConfigHomeDisplayPath()).toBe("/tmp/test-hare");
    expect(joinUserConfigDisplayPath("teams", "alpha")).toBe(
      "/tmp/test-hare/teams/alpha",
    );
  });

  test("rejects path separators in CLAUDE_PROJECT_CONFIG_DIR_NAME", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare/skills";
    expect(() => getProjectConfigDirName()).toThrow(
      "CLAUDE_PROJECT_CONFIG_DIR_NAME must not contain path separators",
    );
  });

  test("rejects dot-directory traversal names", () => {
    process.env.CLAUDE_PROJECT_CONFIG_DIR_NAME = "..";
    expect(() => getProjectConfigDirName()).toThrow(
      'CLAUDE_PROJECT_CONFIG_DIR_NAME must be a directory name, not "." or ".."',
    );
  });
});
