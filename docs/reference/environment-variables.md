# 环境变量参考

本文只整理当前仓库里**对外可用**或**需要明确边界**的环境变量，不尝试枚举所有
内部实现细节。

## 稳定性口径

环境变量分三层：

1. **公开 / 推荐**
   - 面向 CLI 使用者、外部宿主、示例运行者
   - 可以写进 README / 示例 / 正式接入说明
2. **高级 / 宿主管理**
   - 仍可用，但更偏嵌入式宿主、CI、平台适配或兼容行为
   - 可以使用，但不建议普通用户默认依赖
3. **内部 / 调试**
   - 用于调试、profiling、feature gate、宿主内部接线
   - 不纳入长期稳定承诺，不应写进外部接入文档

如果目标是对外长期承诺行为，只应承诺第 1 层；第 2 层需要谨慎使用；第 3 层不承诺
稳定。

## 公开 / 推荐

### 1. 配置目录

| 变量 | 用途 | 备注 |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR` | 用户级配置目录 | 默认行为依赖用户 home 目录 |
| `CLAUDE_PROJECT_CONFIG_DIR_NAME` | 项目级配置目录名 | 必须是目录名，不能带路径分隔符 |
| `CLAUDE_CODE_EFFORT_LEVEL` | 覆盖当前 session 的 effort | 支持 `low` / `medium` / `high` / `max` / `xhigh`，其中 `xhigh` 仅 OpenAI 路径保留 |

示例：

```powershell
$env:CLAUDE_CONFIG_DIR = "$HOME\\.hare"
$env:CLAUDE_PROJECT_CONFIG_DIR_NAME = ".hare"
hare
```

说明：

- `CLAUDE_CODE_EFFORT_LEVEL` 会影响请求层实际发送的 effort
- 底部 `/effort` 提示和模型旁 effort 后缀会跟随该变量显示
- `auto` / `unset` 会清空 env override，回退到 settings 或模型默认值

### 2. First-party / Anthropic 直连

| 变量 | 用途 | 备注 |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | 直连 API key | 普通 CLI / 非托管场景优先使用 |
| `ANTHROPIC_AUTH_TOKEN` | 直连 bearer token | 更偏高级 / 托管场景 |
| `ANTHROPIC_BASE_URL` | 自定义 Anthropic-compatible endpoint | 会影响 provider routing |
| `ANTHROPIC_MODEL` | 覆盖当前主模型 | 启动 banner、状态面板、`/model` 当前显示都会跟随它 |

说明：

- 默认 provider 为 `firstParty`
- 如果同时设置第三方 provider 开关，provider 选择会切到对应第三方路径
- `ANTHROPIC_MODEL` 也是 Bedrock / Vertex / Foundry 路径下用于主模型显示与默认选择的 env

### 3. OpenAI-compatible provider

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_OPENAI` | 切到 OpenAI provider |
| `OPENAI_API_KEY` | OpenAI key |
| `OPENAI_BASE_URL` | OpenAI-compatible base URL |
| `OPENAI_MODEL` | 覆盖所有 family 的默认模型 |
| `OPENAI_DEFAULT_HAIKU_MODEL` | 覆盖 haiku family |
| `OPENAI_DEFAULT_SONNET_MODEL` | 覆盖 sonnet family |
| `OPENAI_DEFAULT_OPUS_MODEL` | 覆盖 opus family |

说明：

- 当前优先级是：`settings.modelType` > provider env 开关 > 默认 `firstParty`
- `OPENAI_MODEL` 优先于 `OPENAI_DEFAULT_*`
- `ANTHROPIC_DEFAULT_*_MODEL` 仍是兼容 fallback，但用 OpenAI 时更推荐显式写
  `OPENAI_DEFAULT_*_MODEL`
- 启动 banner、状态面板、`/model` 当前显示会跟随 `OPENAI_MODEL`；不要再指望
  `ANTHROPIC_MODEL` 去驱动 OpenAI provider 的显示

### 4. Gemini provider

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_GEMINI` | 切到 Gemini provider |
| `GEMINI_API_KEY` | Gemini key |
| `GEMINI_BASE_URL` | Gemini-compatible base URL |
| `GEMINI_MODEL` | 覆盖所有 family 的默认模型 |
| `GEMINI_DEFAULT_HAIKU_MODEL` | 覆盖 haiku family |
| `GEMINI_DEFAULT_SONNET_MODEL` | 覆盖 sonnet family |
| `GEMINI_DEFAULT_OPUS_MODEL` | 覆盖 opus family |

说明：

- `GEMINI_MODEL` 优先于 `GEMINI_DEFAULT_*`
- `ANTHROPIC_DEFAULT_*_MODEL` 仍是兼容 fallback，但不建议继续作为 Gemini 的主配置方式
- 启动 banner、状态面板、`/model` 当前显示会跟随 `GEMINI_MODEL`

### 5. Grok provider

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_GROK` | 切到 Grok provider |
| `GROK_API_KEY` / `XAI_API_KEY` | Grok key |
| `GROK_BASE_URL` | Grok-compatible base URL |
| `GROK_MODEL` | 覆盖所有 family 的默认模型 |
| `GROK_DEFAULT_HAIKU_MODEL` | 覆盖 haiku family |
| `GROK_DEFAULT_SONNET_MODEL` | 覆盖 sonnet family |
| `GROK_DEFAULT_OPUS_MODEL` | 覆盖 opus family |
| `GROK_MODEL_MAP` | JSON 字符串，覆盖 family 到模型名的映射 |

说明：

- `GROK_MODEL` 优先于 `GROK_DEFAULT_*` / `GROK_MODEL_MAP`
- 启动 banner、状态面板、`/model` 当前显示会跟随 `GROK_MODEL`

### 6. Bedrock / Vertex / Foundry

这些变量仍属于可公开使用的 provider 配置，但更偏云平台宿主。

#### Bedrock

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_BEDROCK` | 切到 Bedrock provider |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | Bedrock 区域 |
| `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` | small-fast 模型专用区域覆盖 |

#### Vertex

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_VERTEX` | 切到 Vertex provider |
| `ANTHROPIC_VERTEX_PROJECT_ID` | GCP project ID |
| `CLOUD_ML_REGION` | 默认 GCP 区域 |
| `VERTEX_REGION_CLAUDE_*` | 按模型覆盖 Vertex 区域 |

#### Foundry

| 变量 | 用途 |
| --- | --- |
| `CLAUDE_CODE_USE_FOUNDRY` | 切到 Foundry provider |
| `ANTHROPIC_FOUNDRY_RESOURCE` | Azure Foundry resource 名称 |
| `ANTHROPIC_FOUNDRY_BASE_URL` | 直接指定完整 base URL |
| `ANTHROPIC_FOUNDRY_API_KEY` | Foundry API key |

### 7. Kernel 示例 / 嵌入接入

| 变量 | 用途 |
| --- | --- |
| `KERNEL_EXAMPLE_MODEL` | `examples/kernel-headless-embed.ts` 的显式模型覆盖 |
| `KERNEL_DIRECT_SERVER_URL` | `examples/kernel-direct-connect.ts` 的 server URL |
| `KERNEL_DIRECT_AUTH_TOKEN` | `examples/kernel-direct-connect.ts` 的 auth token |
| `KERNEL_DIRECT_OUTPUT_FORMAT` | `examples/kernel-direct-connect.ts` 的输出格式 |

## 高级 / 宿主管理

这些变量仍是支持的，但更适合高级使用者、宿主接入或 CI。

| 变量 | 用途 | 备注 |
| --- | --- | --- |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 直接覆盖 subagent 模型选择 | 示例里已引用 |
| `CLAUDE_CODE_SKIP_PROMPT_HISTORY` | 禁止 transcript 持久化 | 适合 headless / example / CI |
| `CLAUDE_CODE_GIT_BASH_PATH` | Windows 上显式指定 `bash.exe` | 平台适配变量 |
| `CLAUDE_CODE_OAUTH_TOKEN` | 由宿主注入 OAuth token | 更偏桥接 / 托管 / CI |
| `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | 跳过 Bedrock auth 检查 | 更偏高级调试或特殊宿主 |
| `CLAUDE_CODE_SKIP_VERTEX_AUTH` | 跳过 Vertex auth 检查 | 同上 |
| `CLAUDE_CODE_SKIP_FOUNDRY_AUTH` | 跳过 Foundry auth 检查 | 同上 |

## 内部 / 调试

下面这类变量不建议写进外部接入文档，也不建议对外承诺长期稳定：

- `FEATURE_*`
  - 用于 Bun build feature gate
  - 例如 `FEATURE_BUDDY=1`
- Profiling / debug
  - `CLAUDE_CODE_PROFILE_STARTUP`
  - `CLAUDE_CODE_DEBUG_REPAINTS`
  - `CLAUDE_CODE_COMMIT_LOG`
  - `CLAUDE_CODE_PROFILE_QUERY`
  - `CLAUDE_CODE_PERFETTO_*`
- Telemetry / tracing
  - `CLAUDE_CODE_ENABLE_TELEMETRY`
  - `OTEL_*`
  - `ENABLE_BETA_TRACING_*`
- 宿主内部接线
  - `CLAUDE_CODE_ENTRYPOINT`
  - `CLAUDE_CODE_REMOTE*`
  - `CLAUDE_CODE_MESSAGING_SOCKET`
  - `CLAUDE_CODE_SESSION_ACCESS_TOKEN`
  - `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`

这些变量很多会继续存在，但默认按实现细节处理，不作为公开接入承诺面。

## 推荐使用方式

1. **普通 CLI 用户**
   - 优先使用配置目录 + provider 配置
   - 不要默认依赖 `CLAUDE_CODE_*` 调试开关

2. **外部 kernel consumer**
   - 优先依赖：
     - provider 选择变量
     - `CLAUDE_CODE_SKIP_PROMPT_HISTORY`
     - 示例文档里的 `KERNEL_*` 变量

3. **平台 / 宿主 / CI**
   - 可以使用高级变量
   - 但应避免依赖内部接线变量，除非你同时维护该宿主

## 相关入口

- [/D:/work/py/reachy_code/claude-code/README.md](D:/work/py/reachy_code/claude-code/README.md)
- [/D:/work/py/reachy_code/claude-code/README_EN.md](D:/work/py/reachy_code/claude-code/README_EN.md)
- [/D:/work/py/reachy_code/claude-code/examples/README.md](D:/work/py/reachy_code/claude-code/examples/README.md)
- [/D:/work/py/reachy_code/claude-code/src/utils/model/providers.ts](D:/work/py/reachy_code/claude-code/src/utils/model/providers.ts:1)
- [/D:/work/py/reachy_code/claude-code/src/services/api/client.ts](D:/work/py/reachy_code/claude-code/src/services/api/client.ts:1)
- [/D:/work/py/reachy_code/claude-code/src/utils/managedEnvConstants.ts](D:/work/py/reachy_code/claude-code/src/utils/managedEnvConstants.ts:1)
