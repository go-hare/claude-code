# Remote Control Self-Hosting

本文档描述当前仓库内可用的 `remote-control` 自托管路径，覆盖
`claude remote-control` / `claude rc` / `claude bridge` 与 `acp-link` 接入。

## 适用范围

- 自托管 Remote Control Server (RCS)
- 通过 `claude` 连接到自托管 RCS
- 通过 `acp-link` 将 ACP agent 接到同一套 RCS

如果你参考的是旧资料，里面出现的 `hare` 命令在当前打包产物中应替换为
`claude`。

## 组件位置

- RCS 服务端：[`packages/remote-control-server/`](../../packages/remote-control-server/)
- ACP 桥接：[`packages/acp-link/`](../../packages/acp-link/)
- CLI bridge 主链：[`src/bridge/`](../../src/bridge/)
- CLI 快速入口：[`src/entrypoints/cli.tsx`](../../src/entrypoints/cli.tsx)

## 1. 启动 Remote Control Server

本地最小启动：

```bash
RCS_API_KEYS=sk-rcs-change-me bun run rcs
```

默认监听 `http://127.0.0.1:3000`。如果需要容器部署，可直接使用
[`packages/remote-control-server/README.md`](../../packages/remote-control-server/README.md)
中的 Docker 示例。

常用服务端环境变量：

| 变量 | 说明 |
|------|------|
| `RCS_API_KEYS` | 必填。客户端与 worker 连接时使用的 token，支持逗号分隔 |
| `RCS_PORT` | 监听端口，默认 `3000` |
| `RCS_HOST` | 监听地址，默认 `0.0.0.0` |
| `RCS_BASE_URL` | 对外访问地址，反向代理或公网部署时建议显式设置 |

## 2. 配置 claude 连接到自托管 RCS

在运行 `claude` 的环境中设置：

```bash
export CLAUDE_BRIDGE_BASE_URL="https://rcs.example.com"
export CLAUDE_BRIDGE_OAUTH_TOKEN="sk-rcs-change-me"
```

可选变量：

| 变量 | 说明 |
|------|------|
| `CLAUDE_BRIDGE_SESSION_INGRESS_URL` | 单独指定 WebSocket 入口地址；不设时默认跟随 `CLAUDE_BRIDGE_BASE_URL` |
| `CLAUDE_CODE_REMOTE` | 标记当前进程为远程执行模式；通常由 bridge 流程自行处理 |

然后启动远程控制模式：

```bash
claude remote-control
```

等价别名：

```bash
claude rc
claude bridge
```

`remote-control` 快速路径仍受 `BRIDGE_MODE` feature 控制。开发模式默认启用；
自定义构建如果关闭了该 feature，相关命令不会出现。

## 3. ACP agent 接入

如果你要把 ACP agent 也接到同一台自托管 RCS，可在运行 `acp-link` 的环境中设置：

```bash
ACP_RCS_URL=http://localhost:3000 ACP_RCS_TOKEN=sk-rcs-change-me acp-link claude-bun -- --acp
```

常用 ACP 侧变量：

| 变量 | 说明 |
|------|------|
| `ACP_RCS_URL` | RCS 的 HTTP 地址 |
| `ACP_RCS_TOKEN` | 与 `RCS_API_KEYS` 对应的 token |

更多 `acp-link` 参数和认证细节见
[`packages/acp-link/README.md`](../../packages/acp-link/README.md)。

## 4. 反向代理与公网部署

RCS 同时使用 HTTP 与 WebSocket/SSE。放到 Nginx、Caddy 或其他网关后面时，
需要确保：

- WebSocket upgrade 头透传
- 长连接超时足够大
- `RCS_BASE_URL` 与外部访问地址一致

完整反向代理示例见
[`packages/remote-control-server/README.md`](../../packages/remote-control-server/README.md)。

## 5. 排查要点

如果 `claude remote-control` 无法连上自托管 RCS，优先检查：

1. `RCS_API_KEYS` 与 `CLAUDE_BRIDGE_OAUTH_TOKEN` 是否一致
2. `CLAUDE_BRIDGE_BASE_URL` 是否指向正确的对外地址
3. 反向代理是否放通 WebSocket
4. 当前构建是否启用了 `BRIDGE_MODE`
