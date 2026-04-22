# Config Directory Abstraction

## 1. Background

The codebase currently has two different configuration directory concepts:

- a user-global config home, which is already partially abstracted through
  `CLAUDE_CONFIG_DIR`
- a project-local config directory, which is still widely hardcoded as
  `.claude`

That means the following goal is only half-supported today:

- user-level: `~/.hare`
- project-level: `<repo>/.hare`

The user-global half is already close. The project-local half is not.

This document defines the correct design for making both layers configurable
without breaking settings, skills, worktrees, permissions, sandbox rules,
plugins, or builtin tools.

## 2. Goal

Support a configurable directory scheme with the following defaults:

- user-global config home:
  - env var: `CLAUDE_CONFIG_DIR`
  - default: `~/.claude`
- project-local config dir name:
  - env var: `CLAUDE_PROJECT_CONFIG_DIR_NAME`
  - default: `.claude`

This allows an installation to choose:

- user-global config home: `~/.hare`
- project-local config dir: `.hare`

without requiring a global string replacement in the codebase.

## 3. Non-Goals

This work does not aim to:

- rewrite the config system from scratch
- rename every user-facing string that mentions `.claude`
- perform a global find-and-replace from `.claude` to `.hare`
- change runtime behavior unrelated to config path ownership
- remove support for the existing `.claude` default

## 4. Core Design Decisions

### 4.1 Keep hidden-directory semantics

The project-local directory should remain a hidden directory by convention.

That means:

- prefer `.hare`
- do not recommend bare `hare`

Many parts of the codebase currently assume the project config directory is a
hidden metadata directory rather than a normal project folder.

### 4.2 Separate user-global and project-local configuration

The user-global config home and the project-local config directory are not the
same thing and should not share one implicit path rule.

The correct split is:

- `CLAUDE_CONFIG_DIR` controls the user-global config home
- `CLAUDE_PROJECT_CONFIG_DIR_NAME` controls the project-local config dir name

### 4.3 Introduce path helpers before any migrations

Do not update individual call sites first.

First create a small shared path abstraction, then migrate call sites to it.

## 5. Required Helper API

The helper can live in either:

- `src/utils/envUtils.ts`
- or a new `src/utils/configPaths.ts`

The recommended API surface is:

```ts
export function getUserConfigHomeDir(): string
export function getProjectConfigDirName(): string
export function getProjectConfigDir(cwd: string): string
export function joinProjectConfigPath(cwd: string, ...parts: string[]): string
```

Behavior rules:

- `getUserConfigHomeDir()`
  - uses `CLAUDE_CONFIG_DIR`
  - falls back to `join(homedir(), '.claude')`
- `getProjectConfigDirName()`
  - uses `CLAUDE_PROJECT_CONFIG_DIR_NAME`
  - falls back to `.claude`
- `getProjectConfigDir(cwd)`
  - returns `join(cwd, getProjectConfigDirName())`
- `joinProjectConfigPath(cwd, ...parts)`
  - returns `join(getProjectConfigDir(cwd), ...parts)`

Optional hardening:

- reject empty project dir names
- reject path separators in `CLAUDE_PROJECT_CONFIG_DIR_NAME`
- preserve hidden-directory defaults in docs and examples

## 6. Migration Layers

This change must be executed in layers.

### 6.1 Layer 1: Path Sources

These files define the project-local source paths and must move first:

- `src/utils/settings/settings.ts`
- `src/skills/loadSkillsDir.ts`
- `src/utils/skills/skillChangeDetector.ts`
- `src/utils/worktree.ts`

These files currently hardcode:

- `.claude/settings.json`
- `.claude/settings.local.json`
- `.claude/skills`
- `.claude/commands`
- `.claude/worktrees`

If these are not migrated, project-local `.hare` cannot work at all.

### 6.2 Layer 2: Initialization And Verification

These files create and validate project-local structure:

- `src/commands/init.ts`
- `src/commands/init-verifiers.ts`

These currently create or verify:

- `.claude/settings*.json`
- `.claude/skills/*`

If these are not migrated, initialization will keep generating `.claude`.

### 6.3 Layer 3: Safety, Permissions, And Sandbox

These files are critical and easy to miss:

- `src/utils/permissions/filesystem.ts`
- `src/utils/sandbox/sandbox-adapter.ts`
- `src/utils/permissions/pathValidation.ts`
- `src/utils/permissions/permissions.ts`

These rules do more than join paths. They also encode:

- dangerous-path detection
- special allow rules
- protection of project settings files
- special handling of project skills directories

If this layer is missed:

- the new project dir may be blocked incorrectly
- or old protection rules may silently stop applying

### 6.4 Layer 4: Plugins And Extra Directory Readers

These files continue to read project-local `.claude` structure:

- `src/utils/plugins/addDirPluginSettings.ts`
- `src/utils/plugins/*`

They need to stop assuming the project-local settings path is always
`.claude/settings.json`.

### 6.5 Layer 5: Builtin Tools

High-priority builtin tool paths to inspect:

- `packages/builtin-tools/src/tools/AgentTool/agentMemory.ts`
- `packages/builtin-tools/src/tools/AgentTool/agentMemorySnapshot.ts`
- `packages/builtin-tools/src/tools/ScheduleCronTool/*`
- `packages/builtin-tools/src/tools/FileEditTool/constants.ts`
- `packages/builtin-tools/src/tools/FileReadTool/FileReadTool.ts`

These are runtime behavior paths, not just user-facing strings.

### 6.6 Layer 6: Documentation, Prompts, And Tests

This layer comes last:

- `README*`
- `docs/**`
- `tests/**`
- user-facing command text
- any hardcoded `.claude` instructional copy

This layer is important for consistency, but it should not be used as the first
signal that the migration is complete.

## 7. Recommended Implementation Order

### Phase 0: Introduce Helpers

Add the shared config path helper API first.

No broad call site migration should start before this exists.

### Phase 1: Migrate Path Sources

Update:

- `src/utils/settings/settings.ts`
- `src/skills/loadSkillsDir.ts`
- `src/utils/skills/skillChangeDetector.ts`
- `src/utils/worktree.ts`

This establishes the new source of truth for project-local paths.

### Phase 2: Migrate Init And Safety

Update:

- `src/commands/init.ts`
- `src/commands/init-verifiers.ts`
- `src/utils/permissions/*`
- `src/utils/sandbox/sandbox-adapter.ts`

This ensures new paths are both created correctly and protected correctly.

### Phase 3: Migrate Plugins And Builtin Tools

Update:

- `src/utils/plugins/*`
- `packages/builtin-tools/*`

This makes project-local `.hare` behave correctly at runtime.

### Phase 4: Migrate Docs And Tests

Update examples, docs, prompts, and tests only after runtime behavior is
stable.

## 8. Verification Strategy

At minimum, verify all of the following:

1. user-global settings are read from `CLAUDE_CONFIG_DIR`
2. project settings are read from `<repo>/<project-config-dir>/settings.json`
3. project local settings are read from `<repo>/<project-config-dir>/settings.local.json`
4. project skills and commands load from the configured project dir
5. worktrees resolve under the configured project dir
6. `init` creates the configured project dir, not `.claude`
7. permissions and sandbox rules still protect settings and skills correctly
8. builtin tools that read or write project-local metadata continue to work

Recommended test matrix:

- default config:
  - `CLAUDE_PROJECT_CONFIG_DIR_NAME` unset
  - expect `.claude`
- custom config:
  - `CLAUDE_PROJECT_CONFIG_DIR_NAME=.hare`
  - expect `.hare`

## 9. Rollout Recommendation

The safest rollout is:

1. land helper API
2. land Layer 1 and Layer 2 together
3. land Layer 3 before claiming the feature is ready
4. land Layer 4 and Layer 5
5. finish with docs and tests

Do not ship the feature after only updating settings and skills paths. The
permissions and sandbox layer must be included in the same overall migration.

## 10. Practical Conclusion

Changing `.claude` to `.hare` is a valid feature, but it is not a one-line
rename.

The correct solution is:

- keep user-global config home configurable through `CLAUDE_CONFIG_DIR`
- add project-local config dir configurability through
  `CLAUDE_PROJECT_CONFIG_DIR_NAME`
- migrate the codebase in layers
- validate the permissions and sandbox rules before calling the work complete
