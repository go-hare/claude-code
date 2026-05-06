# 环境变量参考

本文整理当前仓库在生产路径中读取、透传或声明支持的环境变量。它既覆盖对外推荐配置，也覆盖
宿主、调试、CI、provider adapter、kernel runtime、RCS/ACP 和平台探测变量。

> 口径：本文件来自 `src/`、`packages/`、`scripts/`、`examples/` 与 `build.ts` 的 env
> 扫描，再按实际用途归类。测试专用 fixture 变量不作为公开配置承诺。

## 稳定性

| 层级 | 含义 | 使用建议 |
| --- | --- | --- |
| 公开 / 推荐 | 普通 CLI、provider、模型、token、配置目录 | README、部署脚本、用户配置可以使用 |
| 高级 / 宿主管理 | headless、kernel、bridge、RCS、ACP、CI、插件和 MCP 管理 | 宿主或平台可以使用，但要固定版本 |
| 内部 / 调试 | profiling、feature gate、实验、平台探测、测试开关 | 只用于排障或开发，不承诺长期稳定 |
| 系统 / 平台 | `HOME`、`PATH`、`TERM`、`CI` 等运行环境变量 | 由 OS、terminal、CI 或云平台提供 |

## 常用配置模板

### Anthropic-compatible / DeepSeek 这种 Anthropic 路径

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "<token>",
    "ANTHROPIC_BASE_URL": "https://api.example.com/anthropic",
    "ANTHROPIC_MODEL": "main-model",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "small-fast-model",
    "ANTHROPIC_SMALL_FAST_MODEL": "small-fast-model",
    "CLAUDE_CODE_EFFORT_LEVEL": "high"
  }
}
```

说明：

- 没有 `ANTHROPIC_HAIKU_MODEL`。正确变量是 `ANTHROPIC_DEFAULT_HAIKU_MODEL`。
- `ANTHROPIC_DEFAULT_HAIKU_MODEL` 覆盖 haiku family。
- `ANTHROPIC_SMALL_FAST_MODEL` 覆盖轻量 side request，例如 token 估算、宠物 reaction。
- 如果主模型很强或会长 reasoning，建议同时配置 small-fast，避免轻量请求也走主模型。

### OpenAI-compatible / vLLM / Ollama / 本地网关

```json
{
  "env": {
    "CLAUDE_CODE_USE_OPENAI": "1",
    "OPENAI_API_KEY": "<token>",
    "OPENAI_BASE_URL": "http://127.0.0.1:8317/v1",
    "OPENAI_MODEL": "main-model",
    "OPENAI_DEFAULT_HAIKU_MODEL": "small-fast-model",
    "OPENAI_SMALL_FAST_MODEL": "small-fast-model",
    "OPENAI_MAX_TOKENS": "32000",
    "CLAUDE_CODE_EFFORT_LEVEL": "high"
  }
}
```

说明：

- OpenAI 路径优先使用 `OPENAI_*`，不要用 `ANTHROPIC_MODEL` 驱动 OpenAI provider。
- `OPENAI_MAX_TOKENS` 优先于 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`，用于控制 OpenAI-compatible
  请求的 `max_tokens`。
- `OPENAI_SMALL_FAST_MODEL` 对宠物、摘要、轻量请求很重要。

## 配置目录和设置加载

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR` | 用户级配置目录 | 公开 |
| `CLAUDE_PROJECT_CONFIG_DIR_NAME` | 项目级配置目录名，只能是目录名 | 公开 |
| `XDG_CONFIG_HOME` | Unix 配置目录 fallback | 系统 |
| `CLAUDE_ENV_FILE` | 额外 env 文件入口 | 高级 |
| `CLAUDE_CODE_MANAGED_SETTINGS_PATH` | remote/managed settings 路径 | 高级 |
| `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` | 宿主管理 provider env，避免 settings 覆盖宿主路由 | 高级 |
| `CLAUDE_CODE_DONT_INHERIT_ENV` | 子进程不继承外部 env | 高级 |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | 子进程 env 清理策略 | 内部 |

## Provider 选择和认证

### First-party / Anthropic-compatible

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | API key | 公开 |
| `ANTHROPIC_AUTH_TOKEN` | bearer token / OAuth token 类认证 | 公开 |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible base URL | 公开 |
| `ANTHROPIC_UNIX_SOCKET` | Unix socket endpoint | 高级 |
| `ANTHROPIC_BETAS` | 追加 beta headers | 高级 |
| `ANTHROPIC_CUSTOM_HEADERS` | 追加自定义请求头 | 高级 |
| `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR` | 从文件描述符读取 API key | 宿主 |
| `CLAUDE_CODE_API_KEY_HELPER_TTL_MS` | apiKeyHelper 缓存 TTL | 高级 |
| `CLAUDE_CODE_API_BASE_URL` | API base URL 内部覆盖 | 内部 |
| `CLAUDE_CODE_CUSTOM_OAUTH_URL` | 自定义 OAuth URL | 高级 |
| `CLAUDE_CODE_OAUTH_TOKEN` | 宿主注入 OAuth token | 高级 |
| `CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR` | 从文件描述符读取 OAuth token | 宿主 |
| `CLAUDE_CODE_OAUTH_CLIENT_ID` | OAuth client id | 高级 |
| `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` | OAuth refresh token | 高级 |
| `CLAUDE_CODE_OAUTH_SCOPES` | OAuth scopes | 高级 |

### OpenAI-compatible

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_OPENAI` | 切到 OpenAI provider | 公开 |
| `OPENAI_API_KEY` | OpenAI-compatible key | 公开 |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL | 公开 |
| `OPENAI_ORG_ID` | OpenAI organization id | 高级 |
| `OPENAI_PROJECT_ID` | OpenAI project id | 高级 |
| `OPENAI_ENABLE_THINKING` | DeepSeek-style thinking 显式启用/禁用 | 高级 |
| `OPENAI_MAX_TOKENS` | OpenAI-compatible `max_tokens` 覆盖 | 公开 |
| `DEEPSEEK_API_KEY` | DeepSeek balance/provider usage 查询 fallback | 高级 |

### Gemini

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_GEMINI` | 切到 Gemini provider | 公开 |
| `GEMINI_API_KEY` | Gemini key | 公开 |
| `GEMINI_BASE_URL` | Gemini-compatible base URL | 公开 |

### Grok / xAI

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_GROK` | 切到 Grok provider | 公开 |
| `GROK_API_KEY` | Grok key | 公开 |
| `XAI_API_KEY` | Grok key fallback | 公开 |
| `GROK_BASE_URL` | Grok base URL，默认 `https://api.x.ai/v1` | 公开 |
| `GROK_MODEL_MAP` | JSON 字符串，覆盖 family 到模型的映射 | 高级 |

### Bedrock

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_BEDROCK` | 切到 Bedrock provider | 公开 |
| `AWS_REGION` | AWS region | 公开 |
| `AWS_DEFAULT_REGION` | AWS region fallback | 公开 |
| `AWS_PROFILE` | AWS profile | 系统 |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock bearer token | 高级 |
| `ANTHROPIC_BEDROCK_BASE_URL` | Bedrock base URL override | 高级 |
| `BEDROCK_BASE_URL` | Bedrock base URL fallback/legacy | 高级 |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | 跳过 Bedrock auth 检查 | 高级 |
| `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` | small-fast 模型专用区域覆盖 | 高级 |

### Vertex

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_VERTEX` | 切到 Vertex provider | 公开 |
| `ANTHROPIC_VERTEX_PROJECT_ID` | GCP project id | 公开 |
| `ANTHROPIC_VERTEX_BASE_URL` | Vertex base URL override | 高级 |
| `VERTEX_BASE_URL` | Vertex base URL fallback/legacy | 高级 |
| `CLOUD_ML_REGION` | 默认 Vertex region | 公开 |
| `VERTEX_REGION_CLAUDE_*` | 按模型覆盖 Vertex region | 公开 |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP credentials file | 系统 |
| `GOOGLE_CLOUD_PROJECT` | GCP project fallback | 系统 |
| `GCLOUD_PROJECT` | GCP project fallback | 系统 |
| `CLAUDE_CODE_SKIP_VERTEX_AUTH` | 跳过 Vertex auth 检查 | 高级 |

### Foundry

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_FOUNDRY` | 切到 Foundry provider | 公开 |
| `ANTHROPIC_FOUNDRY_RESOURCE` | Azure Foundry resource 名称 | 公开 |
| `ANTHROPIC_FOUNDRY_BASE_URL` | Foundry 完整 base URL | 公开 |
| `ANTHROPIC_FOUNDRY_API_KEY` | Foundry API key | 公开 |
| `CLAUDE_CODE_SKIP_FOUNDRY_AUTH` | 跳过 Foundry auth 检查 | 高级 |

## 模型和 family 覆盖

### 主模型

| Provider | 主模型变量 |
| --- | --- |
| Anthropic-compatible | `ANTHROPIC_MODEL` |
| OpenAI-compatible | `OPENAI_MODEL` |
| Gemini | `GEMINI_MODEL` |
| Grok | `GROK_MODEL` |

### Haiku / Sonnet / Opus family

| Provider | Haiku | Sonnet | Opus |
| --- | --- | --- | --- |
| Anthropic-compatible | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `ANTHROPIC_DEFAULT_SONNET_MODEL` | `ANTHROPIC_DEFAULT_OPUS_MODEL` |
| OpenAI-compatible | `OPENAI_DEFAULT_HAIKU_MODEL` | `OPENAI_DEFAULT_SONNET_MODEL` | `OPENAI_DEFAULT_OPUS_MODEL` |
| Gemini | `GEMINI_DEFAULT_HAIKU_MODEL` | `GEMINI_DEFAULT_SONNET_MODEL` | `GEMINI_DEFAULT_OPUS_MODEL` |
| Grok | 通过 `GROK_MODEL_MAP` | 通过 `GROK_MODEL_MAP` | 通过 `GROK_MODEL_MAP` |

每个 family 还支持可选展示元数据：

| 后缀 | 用途 |
| --- | --- |
| `_NAME` | `/model` 或 UI 中显示的名称 |
| `_DESCRIPTION` | 模型说明 |
| `_SUPPORTED_CAPABILITIES` | 能力覆盖，配合 `src/utils/model/modelSupportOverrides.ts` |

示例：`ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME`、
`OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES`、
`GEMINI_DEFAULT_OPUS_MODEL_DESCRIPTION`。

### Small-fast 模型

| 变量 | 用途 |
| --- | --- |
| `ANTHROPIC_SMALL_FAST_MODEL` | Anthropic-compatible 或 fallback 的轻量 fast 模型 |
| `OPENAI_SMALL_FAST_MODEL` | OpenAI-compatible 轻量 fast 模型 |
| `GEMINI_SMALL_FAST_MODEL` | Gemini 轻量 fast 模型 |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 默认 subagent 模型覆盖 |

`*_SMALL_FAST_MODEL` 会影响宠物 reaction、轻量 side query、token 估算等“短小快”任务。
如果没有配置，部分路径会回退到 haiku family，再回退到主模型。

## Token、thinking、effort 和超时

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_EFFORT_LEVEL` | session 级 effort 覆盖，支持 `low` / `medium` / `high` / `xhigh` / `max` / `auto` / `unset` | 公开 |
| `CLAUDE_CODE_ALWAYS_ENABLE_EFFORT` | 对未知模型强制启用 effort 支持判断 | 内部 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 通用输出 token 上限覆盖 | 公开 |
| `OPENAI_MAX_TOKENS` | OpenAI-compatible 输出 token 上限覆盖，优先级高于通用变量 | 公开 |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 上下文 token 上限覆盖 | 高级 |
| `API_MAX_INPUT_TOKENS` | API 输入 token 上限覆盖 | 高级 |
| `API_TARGET_INPUT_TOKENS` | API 目标输入 token 覆盖 | 高级 |
| `API_TIMEOUT_MS` | API 请求超时 | 高级 |
| `MAX_THINKING_TOKENS` | thinking token 上限 | 高级 |
| `CLAUDE_CODE_DISABLE_THINKING` | 禁用 thinking 参数 | 高级 |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` | 禁用 adaptive thinking | 高级 |
| `DISABLE_INTERLEAVED_THINKING` | 禁用 interleaved thinking | 高级 |
| `OPENAI_ENABLE_THINKING` | OpenAI-compatible thinking 显式开关 | 高级 |
| `CLAUDE_STREAM_IDLE_TIMEOUT_MS` | stream idle watchdog 超时 | 高级 |
| `CLAUDE_ENABLE_STREAM_WATCHDOG` | stream watchdog 开关 | 内部 |
| `CLAUDE_CODE_STALL_TIMEOUT_MS_FOR_TESTING` | stream stall 测试覆盖 | 内部 |
| `MAX_STRUCTURED_OUTPUT_RETRIES` | structured output 最大重试次数 | 高级 |
| `USE_API_CONTEXT_MANAGEMENT` | API context management 开关 | 高级 |
| `USE_API_CLEAR_TOOL_RESULTS` | API clear tool results 开关 | 高级 |
| `USE_API_CLEAR_TOOL_USES` | API clear tool uses 开关 | 高级 |

输出上限优先级要点：

1. 程序内部 `maxOutputTokensOverride`
2. OpenAI 路径：`OPENAI_MAX_TOKENS`
3. 通用：`CLAUDE_CODE_MAX_OUTPUT_TOKENS`
4. provider / model 默认值

## CLI 行为和功能开关

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_SIMPLE` | simple/bare 模式，跳过非必要启动项 | 公开 |
| `CLAUDE_CODE_FORCE_INTERACTIVE` | 强制交互模式 | 高级 |
| `CLAUDE_CODE_REPL` / `CLAUDE_REPL_MODE` | REPL 模式标记 | 内部 |
| `CLAUDE_CODE_SKIP_PROMPT_HISTORY` | 禁止 prompt/transcript 历史持久化 | 公开 |
| `ENABLE_SESSION_PERSISTENCE` | 启用 session persistence | 高级 |
| `TEST_ENABLE_SESSION_PERSISTENCE` | session persistence 测试开关 | 内部 |
| `CLAUDE_CODE_RESUME_INTERRUPTED_TURN` | 恢复 interrupted turn | 高级 |
| `CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES` | 输出 partial stream messages | 高级 |
| `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS` | 输出 session state events | 高级 |
| `CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES` | 输出 tool-use summary events | 高级 |
| `CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT` | 输出 token usage attachment | 高级 |
| `CLAUDE_CODE_OVERRIDE_DATE` | 覆盖系统日期上下文 | 高级 |
| `CLAUDE_CODE_EXTRA_METADATA` | 追加请求 metadata | 高级 |
| `CLAUDE_CODE_EXTRA_BODY` | 追加 API 请求 body | 高级 |
| `CLAUDE_CODE_TAGS` | session/tag metadata | 高级 |
| `CLAUDE_CODE_SESSION_ID` | session id 覆盖/透传 | 高级 |
| `CLAUDE_CODE_SESSION_KIND` | session kind | 内部 |
| `CLAUDE_CODE_SESSION_NAME` | session name | 内部 |
| `CLAUDE_CODE_SESSION_LOG` | session log path | 内部 |
| `CLAUDE_CODE_PARENT_SESSION_ID` | 父 session id | 内部 |
| `CLAUDE_CODE_JSONL_TRANSCRIPT` | JSONL transcript path/开关 | 内部 |

## Agents、team、tasks、plan

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_AGENT` | agent 进程标记 | 内部 |
| `CLAUDE_CODE_AGENT_COLOR` | teammate/agent 颜色 | 内部 |
| `CLAUDE_CODE_AGENT_LIST_IN_MESSAGES` | 消息里显示 agent list | 内部 |
| `CLAUDE_AGENT_SDK_CLIENT_APP` | SDK client app 标记 | 高级 |
| `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS` | SDK 禁用 builtin agents | 高级 |
| `CLAUDE_AGENT_SDK_MCP_NO_PREFIX` | SDK MCP tool name prefix 行为 | 高级 |
| `CLAUDE_AGENT_SDK_VERSION` | SDK 版本透传 | 内部 |
| `CLAUDE_CODE_ENABLE_TASKS` | 启用 task 工具/任务面 | 高级 |
| `CLAUDE_CODE_TASK_LIST_ID` | 当前 task list id | 内部 |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` | 禁用后台任务 | 高级 |
| `CLAUDE_AUTO_BACKGROUND_TASKS` | 自动后台任务策略 | 高级 |
| `CLAUDE_CODE_AUTO_MODE_MODEL` | auto-mode 模型覆盖 | 高级 |
| `CLAUDE_CODE_COORDINATOR_MODE` | coordinator mode 开关 | 高级 |
| `CLAUDE_CODE_VERIFY_PLAN` | plan verification 开关 | 高级 |
| `CLAUDE_CODE_PLAN_MODE_REQUIRED` | teammate plan mode required | 内部 |
| `CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE` | plan mode interview phase | 内部 |
| `CLAUDE_CODE_PLAN_V2_AGENT_COUNT` | Plan v2 agent 数量 | 高级 |
| `CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT` | Plan v2 explore agent 数量 | 高级 |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED` | 禁用 Agent Teams | 高级 |
| `TEAM_MEMORY_SYNC_URL` | team memory sync endpoint | 高级 |
| `TEAM_MEMORY_SYNC_TOKEN` | team memory sync token，如宿主设置 | 高级 |
| `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` | cowork memory path 覆盖 | 高级 |
| `CLAUDE_COWORK_MEMORY_EXTRA_GUIDELINES` | cowork memory 额外说明 | 高级 |

## Kernel runtime / public runtime

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `KERNEL_EXAMPLE_MODEL` | kernel headless example 模型 | 公开 |
| `KERNEL_DIRECT_SERVER_URL` | direct-connect example server URL | 公开 |
| `KERNEL_DIRECT_AUTH_TOKEN` | direct-connect example token | 公开 |
| `KERNEL_DIRECT_OUTPUT_FORMAT` | direct-connect example output format | 公开 |
| `HARE_KERNEL_RUNTIME_HEADLESS_COMMAND` | stdio runtime headless command | 高级 |
| `HARE_KERNEL_RUNTIME_HEADLESS_ARGS_JSON` | stdio runtime headless args JSON | 高级 |
| `HARE_KERNEL_RUNTIME_HEADLESS_CWD` | stdio runtime headless cwd | 高级 |
| `HARE_KERNEL_RUNTIME_HEADLESS_EXECUTOR` | stdio runtime headless executor | 高级 |
| `HARE_KERNEL_RUNTIME_AGENT_COMMAND` | stdio runtime agent command | 高级 |
| `HARE_KERNEL_RUNTIME_AGENT_ARGS_JSON` | stdio runtime agent args JSON | 高级 |
| `HARE_KERNEL_RUNTIME_AGENT_CWD` | stdio runtime agent cwd | 高级 |
| `HARE_KERNEL_RUNTIME_AGENT_EXECUTOR` | stdio runtime agent executor | 高级 |
| `HARE_KERNEL_RUNTIME_EVENT_JOURNAL` | runtime event journal | 高级 |
| `HARE_KERNEL_RUNTIME_CONVERSATION_JOURNAL` | runtime conversation journal | 高级 |
| `HARE_KERNEL_RUNTIME_SOURCE_REEXEC` | source runner re-exec 标记 | 内部 |
| `KERNEL_DEEP_TEST_API_KEY` | kernel deep smoke API key | 测试/验证 |
| `KERNEL_DEEP_TEST_BASE_URL` | kernel deep smoke base URL | 测试/验证 |
| `KERNEL_DEEP_TEST_MODEL` | kernel deep smoke model | 测试/验证 |
| `KERNEL_DEEP_TEST_EFFORT` | kernel deep smoke effort，默认 `high` | 测试/验证 |
| `KERNEL_DEEP_TEST_ORIGINAL` | kernel deep smoke original checkout | 测试/验证 |
| `KERNEL_DEEP_TEST_PROMPT` | kernel deep smoke prompt | 测试/验证 |

## MCP、tools、hooks、skills、plugins

### MCP

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `MCP_TIMEOUT` | MCP 连接/请求超时 | 高级 |
| `MCP_TOOL_TIMEOUT` | MCP tool 调用超时 | 高级 |
| `MAX_MCP_OUTPUT_TOKENS` | MCP 输出 token 上限 | 高级 |
| `ENABLE_MCP_LARGE_OUTPUT_FILES` | MCP 大输出保存到文件 | 高级 |
| `MCP_SERVER_CONNECTION_BATCH_SIZE` | MCP server 批量连接大小 | 高级 |
| `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE` | remote MCP server 批量连接大小 | 高级 |
| `MCP_OAUTH_CALLBACK_PORT` | MCP OAuth callback port | 高级 |
| `MCP_OAUTH_CLIENT_METADATA_URL` | MCP OAuth client metadata URL | 高级 |
| `MCP_CLIENT_SECRET` | MCP OAuth client secret | 高级 |
| `MCP_XAA_IDP_CLIENT_SECRET` | MCP XAA IdP client secret | 高级 |
| `CLAUDE_CODE_MCP_INSTR_DELTA` | MCP instruction delta | 内部 |

### Builtin tools

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `BASH_MAX_OUTPUT_LENGTH` | Bash tool 输出字符上限 | 公开 |
| `TASK_MAX_OUTPUT_LENGTH` | Task/agent 输出字符上限 | 公开 |
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 默认超时 | 高级 |
| `BASH_MAX_TIMEOUT_MS` | Bash 最大超时 | 高级 |
| `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR` | Bash 保持项目 cwd | 高级 |
| `CLAUDE_CODE_GIT_BASH_PATH` | Windows Git Bash 路径 | 公开 |
| `CLAUDE_CODE_USE_POWERSHELL_TOOL` | 启用 PowerShell tool | 高级 |
| `CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS` | PowerShell 解析超时 | 内部 |
| `CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS` | FileRead 输出 token 上限 | 高级 |
| `CLAUDE_CODE_GLOB_HIDDEN` | Glob 包含隐藏文件 | 高级 |
| `CLAUDE_CODE_GLOB_NO_IGNORE` | Glob 忽略 ignore 规则 | 高级 |
| `CLAUDE_CODE_GLOB_TIMEOUT_SECONDS` | Glob 超时 | 高级 |
| `USE_BUILTIN_RIPGREP` | 使用内置 ripgrep | 高级 |
| `RIPGREP_DOWNLOAD_BASE` | ripgrep 下载 base URL | 内部 |
| `SLASH_COMMAND_TOOL_CHAR_BUDGET` | slash command tool 字符预算 | 高级 |

### Web search

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `WEB_SEARCH_ADAPTER` | `api` / `bing` / `brave` / `exa` 搜索 adapter | 高级 |
| `BRAVE_SEARCH_API_KEY` | Brave Search key | 高级 |
| `BRAVE_API_KEY` | Brave Search key fallback | 高级 |

### Hooks / skills / plugins

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` | session-end hooks 超时 | 高级 |
| `CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT` | 保存 hook 额外上下文 | 内部 |
| `CLAUDE_CODE_DISABLE_POLICY_SKILLS` | 禁用 policy skills | 高级 |
| `CLAUDE_SKILL_LEARNING_DISABLE` | 禁用 skill learning | 高级 |
| `CLAUDE_SKILL_LEARNING_HOME` | skill learning home | 高级 |
| `SKILL_LEARNING_ENABLED` | skill learning 开关 | 高级 |
| `SKILL_LEARNING_OBSERVER_BACKEND` | skill learning observer backend | 高级 |
| `SKILL_SEARCH_ENABLED` | skill search 开关 | 高级 |
| `SKILL_SEARCH_INTENT_ENABLED` | skill search intent 开关 | 高级 |
| `SKILL_SEARCH_INTENT_TIMEOUT_MS` | skill search intent 超时 | 高级 |
| `SKILL_SEARCH_AUTOLOAD_LIMIT` | skill autoload 数量 | 高级 |
| `SKILL_SEARCH_AUTOLOAD_MAX_CHARS` | skill autoload 字符上限 | 高级 |
| `SKILL_SEARCH_AUTOLOAD_MIN_SCORE` | skill autoload 最小分数 | 高级 |
| `SKILL_SEARCH_DISPLAY_MIN_SCORE` | skill display 最小分数 | 高级 |
| `CLAUDE_CODE_PLUGIN_CACHE_DIR` | plugin cache 目录 | 高级 |
| `CLAUDE_CODE_PLUGIN_SEED_DIR` | plugin seed 目录 | 高级 |
| `CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS` | plugin git 超时 | 高级 |
| `CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE` | plugin zip cache | 高级 |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` | 同步 plugin install | 高级 |
| `CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS` | 同步 plugin install 超时 | 高级 |
| `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL` | 禁用官方 marketplace 自动安装 | 高级 |
| `CLAUDE_CODE_USE_COWORK_PLUGINS` | cowork plugins | 内部 |
| `FORCE_AUTOUPDATE_PLUGINS` | 强制插件自动更新 | 内部 |

## Companion / Kairos / automation

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_ENABLE_BUDDY` | 启用 Buddy/宠物 | 高级 |
| `FEATURE_BUDDY` | Bun feature gate 启用 Buddy | 内部 |
| `CLAUDE_CODE_ENABLE_KAIROS` | 启用 Kairos | 高级 |
| `FEATURE_KAIROS` | Kairos feature gate | 内部 |
| `CLAUDE_CODE_PROACTIVE` | proactive/Kairos 行为开关 | 高级 |
| `FEATURE_PROACTIVE` | proactive feature gate | 内部 |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 禁用 auto memory | 高级 |
| `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION` | prompt suggestion 开关 | 高级 |
| `CLAUDE_CODE_DISABLE_CRON` | 禁用 cron/autonomy 调度 | 高级 |

## Bridge、remote、RCS、ACP

### ACP

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `ACP_AUTH_TOKEN` | ACP auth token | 高级 |
| `ACP_PERMISSION_MODE` | ACP 默认 permission mode | 高级 |
| `ACP_RCS_URL` | ACP 注册到 RCS 的 URL | 高级 |
| `ACP_RCS_TOKEN` | ACP -> RCS token | 高级 |
| `ACP_RCS_GROUP` | ACP RCS group | 高级 |

### Remote Control Server

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `RCS_HOST` | RCS host | 高级 |
| `RCS_PORT` | RCS port | 高级 |
| `RCS_BASE_URL` | RCS base URL | 高级 |
| `RCS_API_KEYS` | RCS API keys | 高级 |
| `RCS_JWT_EXPIRES_IN` | RCS JWT 过期时间 | 高级 |
| `RCS_HEARTBEAT_INTERVAL` | RCS heartbeat 间隔 | 高级 |
| `RCS_DISCONNECT_TIMEOUT` | RCS disconnect timeout | 高级 |
| `RCS_POLL_TIMEOUT` | RCS poll timeout | 高级 |
| `RCS_WS_IDLE_TIMEOUT` | RCS websocket idle timeout | 高级 |
| `RCS_WS_KEEPALIVE_INTERVAL` | RCS websocket keepalive interval | 高级 |
| `RCS_VERSION` | RCS version | 内部 |

### Bridge / remote session

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `CLAUDE_CODE_REMOTE` | remote mode 标记 | 内部 |
| `CLAUDE_CODE_REMOTE_SESSION_ID` | remote session id | 内部 |
| `CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE` | remote environment type | 内部 |
| `CLAUDE_CODE_REMOTE_MEMORY_DIR` | remote memory dir | 高级 |
| `CLAUDE_CODE_REMOTE_SEND_KEEPALIVES` | remote keepalive | 内部 |
| `CLAUDE_BRIDGE_BASE_URL` | bridge base URL | 高级 |
| `CLAUDE_BRIDGE_OAUTH_TOKEN` | bridge OAuth token | 高级 |
| `CLAUDE_BRIDGE_SESSION_INGRESS_URL` | bridge ingress URL | 高级 |
| `CLAUDE_BRIDGE_USE_CCR_V2` | bridge CCR v2 | 高级 |
| `CLAUDE_CODE_USE_CCR_V2` | CCR v2 开关 | 高级 |
| `CCR_ENABLE_BUNDLE` | CCR bundle 开关 | 内部 |
| `CCR_FORCE_BUNDLE` | 强制 CCR bundle | 内部 |
| `CCR_UPSTREAM_PROXY_ENABLED` | CCR upstream proxy | 内部 |
| `CLAUDE_CODE_CCR_MIRROR` | CCR mirror | 内部 |
| `CLAUDE_CODE_SESSION_ACCESS_TOKEN` | session access token | 内部 |
| `CLAUDE_CODE_SESSION_INGRESS_URL` | session ingress URL | 高级 |
| `SESSION_INGRESS_URL` | session ingress URL fallback | 高级 |
| `CLAUDE_SESSION_INGRESS_TOKEN_FILE` | ingress token file | 高级 |
| `LOCAL_BRIDGE` | local bridge 标记 | 内部 |

## Native、computer use、voice

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `COMPUTER_USE_INPUT_NODE_PATH` | computer-use input native module path | 高级 |
| `COMPUTER_USE_SWIFT_NODE_PATH` | computer-use swift native module path | 高级 |
| `AUDIO_CAPTURE_NODE_PATH` | audio capture native module path | 高级 |
| `IMAGE_PROCESSOR_NODE_PATH` | image processor native module path | 高级 |
| `URL_HANDLER_NODE_PATH` | URL handler native module path | 高级 |
| `ALLOW_ANT_COMPUTER_USE_MCP` | 允许 ant computer-use MCP | 内部 |
| `CLAUDE_CODE_USE_NATIVE_FILE_SEARCH` | native file search | 高级 |
| `VOICE_STREAM_BASE_URL` | voice streaming base URL | 高级 |
| `CLAUDE_CODE_ACCESSIBILITY` | accessibility 支持开关 | 高级 |
| `CLAUDE_CODE_ENABLE_CFC` | Claude for Chrome/Chrome MCP 开关 | 高级 |
| `CLAUDE_CODE_SKIP_CHROME_MCP_SETUP` | 跳过 Chrome MCP setup | 高级 |
| `CLAUDE_CHROME_PERMISSION_MODE` | Chrome permission mode | 高级 |

## Telemetry、日志、tracing、profiling

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `DISABLE_TELEMETRY` | 禁用 telemetry | 公开 |
| `CLAUDE_CODE_ENABLE_TELEMETRY` | 启用 telemetry | 公开 |
| `ENABLE_ENHANCED_TELEMETRY_BETA` | enhanced telemetry beta | 高级 |
| `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` | enhanced telemetry beta | 高级 |
| `CLAUDE_CODE_ENABLE_ANTHROPIC_EVENT_LOGGING` | Anthropic event logging | 内部 |
| `ANT_CLAUDE_CODE_METRICS_ENDPOINT` | Anthropic metrics endpoint | 内部 |
| `DATADOG_API_KEY` | Datadog API key | 高级 |
| `DATADOG_LOGS_ENDPOINT` | Datadog logs endpoint | 高级 |
| `SENTRY_DSN` | Sentry DSN | 高级 |
| `DISABLE_ERROR_REPORTING` | 禁用 error reporting | 公开 |
| `BETA_TRACING_ENDPOINT` | beta tracing endpoint | 高级 |
| `ENABLE_BETA_TRACING_DETAILED` | detailed beta tracing | 高级 |
| `CLAUDE_CODE_PROFILE_STARTUP` | startup profiling | 内部 |
| `CLAUDE_CODE_PROFILE_QUERY` | query profiling | 内部 |
| `CLAUDE_CODE_PERFETTO_TRACE` | perfetto trace path | 内部 |
| `CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S` | perfetto 写入间隔 | 内部 |
| `CLAUDE_CODE_FRAME_TIMING_LOG` | frame timing log | 内部 |
| `CLAUDE_CODE_COMMIT_LOG` | commit log debug | 内部 |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | debug logs dir | 内部 |
| `CLAUDE_CODE_DEBUG_LOG_LEVEL` | debug log level | 内部 |
| `CLAUDE_CODE_DEBUG_REPAINTS` | repaint debug | 内部 |
| `CLAUDE_CODE_DIAGNOSTICS_FILE` | diagnostics output file | 内部 |
| `DEBUG` | Node/debug package debug selector | 系统 |
| `DEBUG_SDK` | SDK debug | 高级 |
| `CLAUDE_DEBUG` | Claude debug | 高级 |

### OpenTelemetry

| 变量 / 前缀 | 用途 |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | OTLP headers |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | OTLP protocol |
| `OTEL_EXPORTER_OTLP_LOGS_PROTOCOL` | OTLP logs protocol |
| `OTEL_EXPORTER_OTLP_METRICS_PROTOCOL` | OTLP metrics protocol |
| `OTEL_EXPORTER_OTLP_TRACES_PROTOCOL` | OTLP traces protocol |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | metrics temporality |
| `OTEL_LOGS_EXPORTER` | logs exporter |
| `OTEL_METRICS_EXPORTER` | metrics exporter |
| `OTEL_TRACES_EXPORTER` | traces exporter |
| `OTEL_LOGS_EXPORT_INTERVAL` | logs export interval |
| `OTEL_METRIC_EXPORT_INTERVAL` | metric export interval |
| `OTEL_TRACES_EXPORT_INTERVAL` | traces export interval |
| `OTEL_LOG_TOOL_CONTENT` | 是否记录 tool content |
| `OTEL_LOG_TOOL_DETAILS` | 是否记录 tool details |
| `OTEL_LOG_USER_PROMPTS` | 是否记录 user prompts |
| `ANT_OTEL_*` | Anthropic 内部 OTEL 覆盖 |

### Langfuse

| 变量 | 用途 |
| --- | --- |
| `LANGFUSE_PUBLIC_KEY` | Langfuse public key |
| `LANGFUSE_SECRET_KEY` | Langfuse secret key |
| `LANGFUSE_BASE_URL` | Langfuse base URL |
| `LANGFUSE_TRACING_ENVIRONMENT` | tracing environment |
| `LANGFUSE_USER_ID` | user id |
| `LANGFUSE_EXPORT_MODE` | export mode |
| `LANGFUSE_FLUSH_AT` | flush batch size |
| `LANGFUSE_FLUSH_INTERVAL` | flush interval |
| `LANGFUSE_TIMEOUT` | request timeout |

## UI、终端、平台探测

| 变量 | 用途 |
| --- | --- |
| `NO_COLOR` | 禁用颜色 |
| `BAT_THEME` | syntax highlight theme |
| `CLAUDE_CODE_SYNTAX_HIGHLIGHT` | syntax highlight 开关 |
| `CLAUDE_CODE_DISABLE_MOUSE` | 禁用鼠标 |
| `CLAUDE_CODE_DISABLE_MOUSE_CLICKS` | 禁用鼠标点击 |
| `CLAUDE_CODE_DISABLE_TERMINAL_TITLE` | 禁用 terminal title |
| `CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL` | 禁用 virtual scroll |
| `CLAUDE_CODE_SCROLL_SPEED` | scroll speed |
| `CLAUDE_CODE_FORCE_FULL_LOGO` | 强制完整 logo |
| `CLAUDE_CODE_NO_FLICKER` | 降低 flicker |
| `CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER` | 首次 render 后退出，测试/截图用 |
| `CLAUDE_CODE_EXIT_AFTER_STOP_DELAY` | stop 后延迟退出 |
| `CLAUDE_CODE_QUESTION_PREVIEW_FORMAT` | question preview 格式 |
| `CLAUDE_CODE_STREAMLINED_OUTPUT` | streamlined output |
| `CLAUDE_CODE_TERMINAL_RECORDING` | terminal recording |
| `CLAUDE_CODE_TMUX_PREFIX` | tmux prefix |
| `CLAUDE_CODE_TMUX_PREFIX_CONFLICTS` | tmux prefix conflict handling |
| `CLAUDE_CODE_TMUX_SESSION` | tmux session |
| `CLAUDE_CODE_TMUX_TRUECOLOR` | tmux truecolor |

平台和 terminal 探测变量包括：`TERM`、`TERM_PROGRAM`、`TERM_PROGRAM_VERSION`、
`COLORTERM`、`COLORFGBG`、`SHELL`、`USER`、`USERNAME`、`HOME`、`PATH`、`PWD`、
`TMPDIR`、`TMP`、`TEMP`、`APPDATA`、`LOCALAPPDATA`、`USERPROFILE`、`XDG_CONFIG_HOME`、
`TMUX`、`TMUX_PANE`、`STY`、`WT_SESSION`、`ITERM_SESSION_ID`、`KITTY_WINDOW_ID`、
`KONSOLE_VERSION`、`GNOME_TERMINAL_SERVICE`、`TILIX_ID`、`VTE_VERSION`、`XTERM_VERSION`、
`ZED_TERM`、`TERMINAL`、`TERMINAL_EMULATOR`、`LC_TERMINAL`、`MSYSTEM`、
`WSL_DISTRO_NAME`、`SSH_CLIENT`、`SSH_CONNECTION`、`SSH_TTY`。

## Network、proxy、TLS

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `HTTP_PROXY` | HTTP proxy | 系统 |
| `HTTPS_PROXY` | HTTPS proxy | 系统 |
| `ALL_PROXY` | all proxy | 系统 |
| `NO_PROXY` | proxy bypass | 系统 |
| `NODE_EXTRA_CA_CERTS` | Node extra CA certs | 系统 |
| `SSL_CERT_FILE` | SSL cert file | 系统 |
| `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` | proxy resolves hosts | 高级 |
| `CLAUDE_CODE_CLIENT_CERT` | client TLS cert | 高级 |
| `CLAUDE_CODE_CLIENT_KEY` | client TLS key | 高级 |
| `CLAUDE_CODE_CLIENT_KEY_PASSPHRASE` | client TLS key passphrase | 高级 |

## Updates、release、build、feature flags

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `FEATURE_*` | Bun build/runtime feature gate，例如 `FEATURE_BUDDY=1` | 内部 |
| `BUN_INSPECT` | dev mode inspector port | 开发 |
| `NODE_ENV` | Node/Bun 环境 | 系统 |
| `NODE_OPTIONS` | Node options | 系统 |
| `COREPACK_ENABLE_AUTO_PIN` | Corepack 行为 | 系统 |
| `UV_THREADPOOL_SIZE` | libuv threadpool size | 系统 |
| `DISABLE_AUTOUPDATER` | 禁用 auto updater | 公开 |
| `ENABLE_AUTOUPDATER` | 启用 auto updater | 高级 |
| `DISABLE_UPGRADE_COMMAND` | 禁用 upgrade command | 高级 |
| `DISABLE_INSTALLATION_CHECKS` | 禁用安装检查 | 高级 |
| `ENABLE_LOCKLESS_UPDATES` | lockless updates | 内部 |
| `ENABLE_PID_BASED_VERSION_LOCKING` | PID version lock | 内部 |
| `CLAUDE_CODE_VERSION` | 版本覆盖/透传 | 内部 |
| `DEMO_VERSION` | demo version | 内部 |

## Cost、billing、usage

| 变量 | 用途 | 稳定性 |
| --- | --- | --- |
| `DISABLE_COST_WARNINGS` | 禁用成本提醒 | 公开 |
| `CLAUDE_CODE_BALANCE_PROVIDER` | balance provider | 高级 |
| `CLAUDE_CODE_BALANCE_URL` | balance 查询 URL | 高级 |
| `CLAUDE_CODE_BALANCE_KEY` | balance 查询 key | 高级 |
| `CLAUDE_CODE_BALANCE_JSON_PATH` | balance JSON path | 高级 |
| `CLAUDE_CODE_BALANCE_CURRENCY` | balance currency | 高级 |
| `CLAUDE_CODE_BALANCE_POLL_INTERVAL_MINUTES` | balance poll interval | 高级 |

## 其他 CLI command 开关

| 变量 | 用途 |
| --- | --- |
| `DISABLE_BUG_COMMAND` | 禁用 bug command |
| `DISABLE_DOCTOR_COMMAND` | 禁用 doctor command |
| `DISABLE_FEEDBACK_COMMAND` | 禁用 feedback command |
| `DISABLE_EXTRA_USAGE_COMMAND` | 禁用 extra usage command |
| `DISABLE_LOGIN_COMMAND` | 禁用 login command |
| `DISABLE_LOGOUT_COMMAND` | 禁用 logout command |
| `DISABLE_INSTALL_GITHUB_APP_COMMAND` | 禁用 GitHub app install command |
| `DISABLE_PROMPT_CACHING` | 禁用 prompt caching |
| `DISABLE_PROMPT_CACHING_HAIKU` | 禁用 Haiku prompt caching |
| `DISABLE_PROMPT_CACHING_SONNET` | 禁用 Sonnet prompt caching |
| `DISABLE_PROMPT_CACHING_OPUS` | 禁用 Opus prompt caching |
| `ENABLE_PROMPT_CACHING_1H_BEDROCK` | Bedrock 1h prompt caching |
| `CLAUDE_CACHED_MICROCOMPACT` | cached microcompact |
| `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | autocompact 百分比覆盖 |
| `DISABLE_AUTO_COMPACT` | 禁用 auto compact |
| `DISABLE_COMPACT` | 禁用 compact |
| `DISABLE_CLAUDE_CODE_SM_COMPACT` | 禁用 SM compact |
| `ENABLE_CLAUDE_CODE_SM_COMPACT` | 启用 SM compact |

## CI、云平台、sandbox 探测

这些变量通常由平台自动注入，代码只用于环境识别、telemetry 或 runtime 策略：

`CI`、`GITHUB_ACTIONS`、`GITHUB_ACTION_INPUTS`、`GITHUB_ACTION_PATH`、`GITHUB_ACTOR`、
`GITHUB_ACTOR_ID`、`GITHUB_EVENT_NAME`、`GITHUB_REPOSITORY`、`GITHUB_REPOSITORY_ID`、
`GITHUB_REPOSITORY_OWNER`、`GITHUB_REPOSITORY_OWNER_ID`、`GITLAB_CI`、`BUILDKITE`、
`CIRCLECI`、`CODESPACES`、`GITPOD_WORKSPACE_ID`、`RUNNER_ENVIRONMENT`、`RUNNER_OS`、
`CF_PAGES`、`VERCEL`、`NETLIFY`、`RENDER`、`RAILWAY_ENVIRONMENT_NAME`、
`RAILWAY_SERVICE_NAME`、`FLY_MACHINE_ID`、`DYNO`、`K_SERVICE`、
`KUBERNETES_SERVICE_HOST`、`AZURE_FUNCTIONS_ENVIRONMENT`、`AWS_EXECUTION_ENV`,
`AWS_LAMBDA_FUNCTION_NAME`、`DENO_DEPLOYMENT_ID`、`WEBSITE_SKU`、`IS_SANDBOX`、
`IS_DEMO`、`SWE_BENCH_INSTANCE_ID`、`SWE_BENCH_RUN_ID`、`SWE_BENCH_TASK_ID`。

## 其他直接 `process.env` 读取

这些变量也在生产路径中被直接读取。多数属于平台识别、内部实验、dev harness、第三方工具兼容
或 vendor SDK 透传，不建议普通用户主动配置。

### Anthropic / growth / OAuth 内部开关

`CLAUDE_GB_ADAPTER_KEY`、`CLAUDE_GB_ADAPTER_URL`、`ENABLE_GROWTHBOOK_DEV`、
`CLAUDE_TRUSTED_DEVICE_TOKEN`、`CLAUDE_FORCE_DISPLAY_SURVEY`、
`CLAUDE_INTERNAL_FC_OVERRIDES`、`CLAUDE_MORERIGHT`、`CLAUBBIT`、`COO_CREATOR`、
`COO_RUNNING_ON_HOMESPACE`、`SPACE_CREATOR_USER_ID`、`USE_LOCAL_OAUTH`、
`USE_STAGING_OAUTH`。

### 内部实验、工具和 dev harness

`BUGHUNTER_DEV_BUNDLE_B64`、`CLAUDE_AFTER_LAST_COMPACT`、`CLAUDE_JOB_DIR`、
`CLAUDE_MOCK_HEADERLESS_429`、`CLAUDE_PROJECT_DIR`、`EMBEDDED_SEARCH_TOOLS`、
`ENABLE_CLAUDEAI_MCP_SERVERS`、`ENABLE_LSP_TOOL`、`ENABLE_TOOL_SEARCH`、
`FALLBACK_FOR_ALL_PRIMARY_MODELS`、`FEATURE_SKILL_LEARNING`、`FORCE_VCR`、
`MONOREPO_ROOT_DIR`、`PROJECT_DOMAIN`、`ULTRAPLAN_PROMPT_FILE`、`USER_TYPE`、
`VCR_RECORD`、`WEIXIN_STATE_DIR`。

### 平台、终端、编辑器和外部工具探测

`ALACRITTY_LOG`、`APP_URL`、`BROWSER`、`ConEmuANSI`、`ConEmuPID`、`ConEmuTask`、
`CURSOR_TRACE_ID`、`EDITOR`、`FLY_APP_NAME`、`FORCE_CODE_TERMINAL`、`LC_ALL`、
`LC_TIME`、`NoDefaultCurrentDirectoryInExePath`、`P4PORT`、`REPL_ID`、`REPL_SLUG`、
`SAFEUSER`、`SESSIONNAME`、`TERMINATOR_UUID`、`VISUAL`、`VSCODE_GIT_ASKPASS_MAIN`、
`VisualStudioVersion`、`WEBSITE_SITE_NAME`、`__CFBundleIdentifier`、
`gcloud_project`、`google_application_credentials`、`google_cloud_project`、
`http_proxy`、`https_proxy`、`no_proxy`、`npm_config_ignore_scripts`。

### Anthropic OTEL aliases

`ANT_OTEL_EXPORTER_OTLP_ENDPOINT`、`ANT_OTEL_EXPORTER_OTLP_HEADERS`、
`ANT_OTEL_EXPORTER_OTLP_PROTOCOL`、`ANT_OTEL_LOGS_EXPORTER`、
`ANT_OTEL_METRICS_EXPORTER`、`ANT_OTEL_TRACES_EXPORTER`。

## 完整扫描索引

下面是生产路径扫描到的主要项目相关变量。系统变量已在上面单独归类；测试 fixture
变量不列入公开承诺。

### `ANTHROPIC_*`

`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`、
`ANTHROPIC_BEDROCK_BASE_URL`、`ANTHROPIC_BETAS`、`ANTHROPIC_CUSTOM_HEADERS`、
`ANTHROPIC_CUSTOM_MODEL_OPTION`、`ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION`、
`ANTHROPIC_CUSTOM_MODEL_OPTION_NAME`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、
`ANTHROPIC_DEFAULT_HAIKU_MODEL_DESCRIPTION`、`ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME`、
`ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES`、
`ANTHROPIC_DEFAULT_OPUS_MODEL`、`ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION`、
`ANTHROPIC_DEFAULT_OPUS_MODEL_NAME`、
`ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES`、
`ANTHROPIC_DEFAULT_SONNET_MODEL`、`ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION`、
`ANTHROPIC_DEFAULT_SONNET_MODEL_NAME`、
`ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES`、
`ANTHROPIC_FOUNDRY_API_KEY`、`ANTHROPIC_FOUNDRY_BASE_URL`、
`ANTHROPIC_FOUNDRY_RESOURCE`、`ANTHROPIC_MODEL`、`ANTHROPIC_SMALL_FAST_MODEL`、
`ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION`、`ANTHROPIC_UNIX_SOCKET`、
`ANTHROPIC_VERTEX_BASE_URL`、`ANTHROPIC_VERTEX_PROJECT_ID`。

### `OPENAI_*`

`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_DEFAULT_HAIKU_MODEL`,
`OPENAI_DEFAULT_HAIKU_MODEL_DESCRIPTION`、`OPENAI_DEFAULT_HAIKU_MODEL_NAME`、
`OPENAI_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES`、`OPENAI_DEFAULT_OPUS_MODEL`,
`OPENAI_DEFAULT_OPUS_MODEL_DESCRIPTION`、`OPENAI_DEFAULT_OPUS_MODEL_NAME`、
`OPENAI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES`、`OPENAI_DEFAULT_SONNET_MODEL`,
`OPENAI_DEFAULT_SONNET_MODEL_DESCRIPTION`、`OPENAI_DEFAULT_SONNET_MODEL_NAME`、
`OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES`、`OPENAI_ENABLE_THINKING`,
`OPENAI_MAX_TOKENS`、`OPENAI_MODEL`、`OPENAI_ORG_ID`、`OPENAI_PROJECT_ID`、
`OPENAI_SMALL_FAST_MODEL`。

### `GEMINI_*` / `GROK_*`

`GEMINI_API_KEY`、`GEMINI_BASE_URL`、`GEMINI_DEFAULT_HAIKU_MODEL`,
`GEMINI_DEFAULT_HAIKU_MODEL_DESCRIPTION`、`GEMINI_DEFAULT_HAIKU_MODEL_NAME`、
`GEMINI_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES`、`GEMINI_DEFAULT_OPUS_MODEL`,
`GEMINI_DEFAULT_OPUS_MODEL_DESCRIPTION`、`GEMINI_DEFAULT_OPUS_MODEL_NAME`、
`GEMINI_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES`、`GEMINI_DEFAULT_SONNET_MODEL`,
`GEMINI_DEFAULT_SONNET_MODEL_DESCRIPTION`、`GEMINI_DEFAULT_SONNET_MODEL_NAME`、
`GEMINI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES`、`GEMINI_MODEL`,
`GEMINI_SMALL_FAST_MODEL`。

`GROK_API_KEY`、`GROK_BASE_URL`、`GROK_MODEL`、`GROK_MODEL_MAP`、`XAI_API_KEY`。

### `CLAUDE_CODE_*`

`CLAUDE_CODE_ABLATION_BASELINE`、`CLAUDE_CODE_ACCESSIBILITY`,
`CLAUDE_CODE_ACCOUNT_TAGGED_ID`、`CLAUDE_CODE_ACCOUNT_UUID`,
`CLAUDE_CODE_ACTION`、`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`,
`CLAUDE_CODE_ADDITIONAL_PROTECTION`、`CLAUDE_CODE_AGENT`,
`CLAUDE_CODE_AGENT_COLOR`、`CLAUDE_CODE_AGENT_LIST_IN_MESSAGES`,
`CLAUDE_CODE_ALWAYS_ENABLE_EFFORT`、`CLAUDE_CODE_API_BASE_URL`,
`CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR`、`CLAUDE_CODE_API_KEY_HELPER_TTL_MS`,
`CLAUDE_CODE_ATTRIBUTION_HEADER`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`,
`CLAUDE_CODE_AUTO_CONNECT_IDE`、`CLAUDE_CODE_AUTO_MODE_MODEL`,
`CLAUDE_CODE_BALANCE_CURRENCY`、`CLAUDE_CODE_BALANCE_JSON_PATH`,
`CLAUDE_CODE_BALANCE_KEY`、`CLAUDE_CODE_BALANCE_POLL_INTERVAL_MINUTES`,
`CLAUDE_CODE_BALANCE_PROVIDER`、`CLAUDE_CODE_BALANCE_URL`,
`CLAUDE_CODE_BASE_REF`、`CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR`,
`CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE`、`CLAUDE_CODE_BRIEF`,
`CLAUDE_CODE_BRIEF_UPLOAD`、`CLAUDE_CODE_BUBBLEWRAP`,
`CLAUDE_CODE_CCR_MIRROR`、`CLAUDE_CODE_CLIENT_CERT`,
`CLAUDE_CODE_CLIENT_KEY`、`CLAUDE_CODE_CLIENT_KEY_PASSPHRASE`,
`CLAUDE_CODE_COMMIT_LOG`、`CLAUDE_CODE_CONTAINER_ID`,
`CLAUDE_CODE_COORDINATOR_MODE`、`CLAUDE_CODE_COWORKER_TYPE`,
`CLAUDE_CODE_CUSTOM_OAUTH_URL`、`CLAUDE_CODE_DATADOG_FLUSH_INTERVAL_MS`,
`CLAUDE_CODE_DEBUG_LOGS_DIR`、`CLAUDE_CODE_DEBUG_LOG_LEVEL`,
`CLAUDE_CODE_DEBUG_REPAINTS`、`CLAUDE_CODE_DIAGNOSTICS_FILE`,
`CLAUDE_CODE_DISABLE_1M_CONTEXT`、`CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING`,
`CLAUDE_CODE_DISABLE_ADVISOR_TOOL`、`CLAUDE_CODE_DISABLE_ATTACHMENTS`,
`CLAUDE_CODE_DISABLE_AUTO_MEMORY`、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS`,
`CLAUDE_CODE_DISABLE_CLAUDE_MDS`、`CLAUDE_CODE_DISABLE_COMMAND_INJECTION_CHECK`,
`CLAUDE_CODE_DISABLE_CRON`、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`,
`CLAUDE_CODE_DISABLE_FAST_MODE`、`CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY`,
`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING`、`CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS`,
`CLAUDE_CODE_DISABLE_LEGACY_MODEL_REMAP`、`CLAUDE_CODE_DISABLE_LOCAL_GATES`,
`CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS`、`CLAUDE_CODE_DISABLE_MOUSE`,
`CLAUDE_CODE_DISABLE_MOUSE_CLICKS`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`,
`CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK`,
`CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL`,
`CLAUDE_CODE_DISABLE_POLICY_SKILLS`、`CLAUDE_CODE_DISABLE_PRECOMPACT_SKIP`,
`CLAUDE_CODE_DISABLE_TERMINAL_TITLE`、`CLAUDE_CODE_DISABLE_THINKING`,
`CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL`、`CLAUDE_CODE_DONT_INHERIT_ENV`,
`CLAUDE_CODE_DUMP_AUTO_MODE`、`CLAUDE_CODE_EAGER_FLUSH`,
`CLAUDE_CODE_EFFORT_LEVEL`、`CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS`,
`CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES`、`CLAUDE_CODE_ENABLE_BUDDY`,
`CLAUDE_CODE_ENABLE_CFC`、`CLAUDE_CODE_ENABLE_FINE_GRAINED_TOOL_STREAMING`,
`CLAUDE_CODE_ENABLE_KAIROS`、`CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION`,
`CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING`、`CLAUDE_CODE_ENABLE_TASKS`,
`CLAUDE_CODE_ENABLE_TELEMETRY`、`CLAUDE_CODE_ENABLE_TOKEN_USAGE_ATTACHMENT`,
`CLAUDE_CODE_ENABLE_XAA`、`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA`,
`CLAUDE_CODE_ENTRYPOINT`、`CLAUDE_CODE_ENVIRONMENT_KIND`,
`CLAUDE_CODE_ENVIRONMENT_RUNNER_VERSION`、`CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER`,
`CLAUDE_CODE_EXIT_AFTER_STOP_DELAY`、`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`,
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS_DISABLED`、`CLAUDE_CODE_EXTRA_BODY`,
`CLAUDE_CODE_EXTRA_METADATA`、`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`,
`CLAUDE_CODE_FORCE_FULL_LOGO`、`CLAUDE_CODE_FORCE_INTERACTIVE`,
`CLAUDE_CODE_FRAME_TIMING_LOG`、`CLAUDE_CODE_GB_BASE_URL`,
`CLAUDE_CODE_GIT_BASH_PATH`、`CLAUDE_CODE_GLOB_HIDDEN`,
`CLAUDE_CODE_GLOB_NO_IGNORE`、`CLAUDE_CODE_GLOB_TIMEOUT_SECONDS`,
`CLAUDE_CODE_HOST_PLATFORM`、`CLAUDE_CODE_IDE_HOST_OVERRIDE`,
`CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL`、`CLAUDE_CODE_IDE_SKIP_VALID_CHECK`,
`CLAUDE_CODE_IDLE_THRESHOLD_MINUTES`、`CLAUDE_CODE_IDLE_TOKEN_THRESHOLD`,
`CLAUDE_CODE_INCLUDE_PARTIAL_MESSAGES`、`CLAUDE_CODE_IS_COWORK`,
`CLAUDE_CODE_JSONL_TRANSCRIPT`、`CLAUDE_CODE_MANAGED_SETTINGS_PATH`,
`CLAUDE_CODE_MAX_CONTEXT_TOKENS`、`CLAUDE_CODE_MAX_OUTPUT_TOKENS`,
`CLAUDE_CODE_MAX_RETRIES`、`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`,
`CLAUDE_CODE_MCP_INSTR_DELTA`、`CLAUDE_CODE_MESSAGING_SOCKET`,
`CLAUDE_CODE_NEW_INIT`、`CLAUDE_CODE_NO_FLICKER`,
`CLAUDE_CODE_OAUTH_CLIENT_ID`、`CLAUDE_CODE_OAUTH_REFRESH_TOKEN`,
`CLAUDE_CODE_OAUTH_SCOPES`、`CLAUDE_CODE_OAUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR`、`CLAUDE_CODE_ORGANIZATION_UUID`,
`CLAUDE_CODE_OTEL_FLUSH_TIMEOUT_MS`,
`CLAUDE_CODE_OTEL_HEADERS_HELPER_DEBOUNCE_MS`,
`CLAUDE_CODE_OTEL_SHUTDOWN_TIMEOUT_MS`、`CLAUDE_CODE_OVERRIDE_DATE`,
`CLAUDE_CODE_PARENT_SESSION_ID`、`CLAUDE_CODE_PERFETTO_TRACE`,
`CLAUDE_CODE_PERFETTO_WRITE_INTERVAL_S`、`CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE`,
`CLAUDE_CODE_PLAN_MODE_REQUIRED`、`CLAUDE_CODE_PLAN_V2_AGENT_COUNT`,
`CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT`、`CLAUDE_CODE_PLUGIN_CACHE_DIR`,
`CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS`、`CLAUDE_CODE_PLUGIN_SEED_DIR`,
`CLAUDE_CODE_PLUGIN_USE_ZIP_CACHE`、`CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2`,
`CLAUDE_CODE_PROACTIVE`、`CLAUDE_CODE_PROFILE_QUERY`,
`CLAUDE_CODE_PROFILE_STARTUP`、`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`,
`CLAUDE_CODE_PROXY_RESOLVES_HOSTS`、`CLAUDE_CODE_PWSH_PARSE_TIMEOUT_MS`,
`CLAUDE_CODE_QUESTION_PREVIEW_FORMAT`、`CLAUDE_CODE_REMOTE`,
`CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE`、`CLAUDE_CODE_REMOTE_MEMORY_DIR`,
`CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`、`CLAUDE_CODE_REMOTE_SESSION_ID`,
`CLAUDE_CODE_REPL`、`CLAUDE_CODE_RESUME_INTERRUPTED_TURN`,
`CLAUDE_CODE_SAVE_HOOK_ADDITIONAL_CONTEXT`、`CLAUDE_CODE_SCROLL_SPEED`,
`CLAUDE_CODE_SESSION_ACCESS_TOKEN`、`CLAUDE_CODE_SESSION_ID`,
`CLAUDE_CODE_SESSION_KIND`、`CLAUDE_CODE_SESSION_LOG`,
`CLAUDE_CODE_SESSION_NAME`、`CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`,
`CLAUDE_CODE_SHELL`、`CLAUDE_CODE_SHELL_PREFIX`、`CLAUDE_CODE_SIMPLE`,
`CLAUDE_CODE_SKIP_BEDROCK_AUTH`、`CLAUDE_CODE_SKIP_CHROME_MCP_SETUP`,
`CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS`、`CLAUDE_CODE_SKIP_FOUNDRY_AUTH`,
`CLAUDE_CODE_SKIP_PROMPT_HISTORY`、`CLAUDE_CODE_SKIP_VERTEX_AUTH`,
`CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS`、`CLAUDE_CODE_SSE_PORT`,
`CLAUDE_CODE_STALL_TIMEOUT_MS_FOR_TESTING`、`CLAUDE_CODE_STREAMLINED_OUTPUT`,
`CLAUDE_CODE_SUBAGENT_MODEL`、`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`,
`CLAUDE_CODE_SYNC_PLUGIN_INSTALL`、`CLAUDE_CODE_SYNC_PLUGIN_INSTALL_TIMEOUT_MS`,
`CLAUDE_CODE_SYNTAX_HIGHLIGHT`、`CLAUDE_CODE_TAGS`,
`CLAUDE_CODE_TASK_LIST_ID`、`CLAUDE_CODE_TERMINAL_RECORDING`,
`CLAUDE_CODE_TEST_FIXTURES_ROOT`、`CLAUDE_CODE_TMPDIR`,
`CLAUDE_CODE_TMUX_PREFIX`、`CLAUDE_CODE_TMUX_PREFIX_CONFLICTS`,
`CLAUDE_CODE_TMUX_SESSION`、`CLAUDE_CODE_TMUX_TRUECOLOR`,
`CLAUDE_CODE_TWO_STAGE_CLASSIFIER`、`CLAUDE_CODE_UNATTENDED_RETRY`,
`CLAUDE_CODE_UNDERCOVER`、`CLAUDE_CODE_USER_EMAIL`,
`CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_CCR_V2`,
`CLAUDE_CODE_USE_COWORK_PLUGINS`、`CLAUDE_CODE_USE_FOUNDRY`,
`CLAUDE_CODE_USE_GEMINI`、`CLAUDE_CODE_USE_GROK`,
`CLAUDE_CODE_USE_NATIVE_FILE_SEARCH`、`CLAUDE_CODE_USE_OPENAI`,
`CLAUDE_CODE_USE_POWERSHELL_TOOL`、`CLAUDE_CODE_USE_VERTEX`,
`CLAUDE_CODE_VERIFY_PLAN`、`CLAUDE_CODE_VERSION`,
`CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR`、`CLAUDE_CODE_WORKER_EPOCH`,
`CLAUDE_CODE_WORKSPACE_HOST_PATHS`。

### Other project prefixes

`ACP_AUTH_TOKEN`、`ACP_PERMISSION_MODE`、`ACP_RCS_GROUP`、`ACP_RCS_TOKEN`,
`ACP_RCS_URL`、`BASH_MAX_OUTPUT_LENGTH`、`BASH_DEFAULT_TIMEOUT_MS`,
`BASH_MAX_TIMEOUT_MS`、`BRAVE_API_KEY`、`BRAVE_SEARCH_API_KEY`、
`CLAUDE_CONFIG_DIR`、`CLAUDE_PROJECT_CONFIG_DIR_NAME`、`CLAUDE_ENV_FILE`,
`CLAUDE_LOCAL_OAUTH_API_BASE`、`CLAUDE_LOCAL_OAUTH_APPS_BASE`,
`CLAUDE_LOCAL_OAUTH_CONSOLE_BASE`、`CLAUDE_STREAM_IDLE_TIMEOUT_MS`,
`COMPUTER_USE_INPUT_NODE_PATH`、`COMPUTER_USE_SWIFT_NODE_PATH`,
`AUDIO_CAPTURE_NODE_PATH`、`IMAGE_PROCESSOR_NODE_PATH`、`URL_HANDLER_NODE_PATH`,
`FEATURE_*`、`HARE_KERNEL_RUNTIME_*`、`KERNEL_*`、`LANGFUSE_*`、`MCP_*`,
`OTEL_*`、`RCS_*`、`SKILL_LEARNING_*`、`SKILL_SEARCH_*`、
`TASK_MAX_OUTPUT_LENGTH`、`TEAM_MEMORY_SYNC_URL`、`WEB_SEARCH_ADAPTER`。

## 相关源码入口

- `src/utils/model/model.ts`
- `src/utils/model/modelOptions.ts`
- `src/utils/model/providers.ts`
- `src/utils/managedEnvConstants.ts`
- `src/services/api/openai/requestBody.ts`
- `src/services/api/claude.ts`
- `src/buddy/companionReact.ts`
- `src/utils/swarm/spawnUtils.ts`
- `packages/builtin-tools/src/tools/WebSearchTool/adapters/`
