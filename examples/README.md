# Kernel Examples

运行示例前，建议先看环境变量参考：

- [../docs/reference/environment-variables.md](../docs/reference/environment-variables.md)

## `kernel-headless-embed.ts`

Minimal external embedding example for the public kernel headless API.

It demonstrates:

- minimal bootstrap setup
- command / tool / agent loading
- default headless environment construction
- running a single headless kernel session through `src/kernel`

For published-package consumers, prefer importing the same surface through
`claude-code/kernel`.

### Run

```powershell
$env:OPENAI_BASE_URL='http://127.0.0.1:8317/v1'
$env:OPENAI_API_KEY='YOUR_KEY'
$env:CLAUDE_CODE_USE_OPENAI='1'
$env:CLAUDE_CODE_SKIP_PROMPT_HISTORY='1'
$env:KERNEL_EXAMPLE_MODEL='gpt-5.4'
bun run examples/kernel-headless-embed.ts "Reply with exactly: kernel-embed-ok"
```

Expected output:

```text
kernel-embed-ok
```

## `kernel-direct-connect.ts`

Minimal external client example for the public kernel direct-connect API.

It demonstrates:

- creating a direct-connect session through `src/kernel`
- using the returned session config
- running a single headless request over the direct-connect channel

For published-package consumers, prefer importing the same surface through
`claude-code/kernel`.

### Run

Start a server first:

```powershell
bun run dev server --host 127.0.0.1 --port 8318 --auth-token testtoken --workspace .
```

Then run the example in another terminal:

```powershell
$env:KERNEL_DIRECT_SERVER_URL='http://127.0.0.1:8318'
$env:KERNEL_DIRECT_AUTH_TOKEN='testtoken'
bun run examples/kernel-direct-connect.ts "Reply with exactly: kernel-direct-ok"
```

Expected output:

```text
kernel-direct-ok
```

## Provider / Subagent Notes

For OpenAI-compatible providers:

- `OPENAI_MODEL` overrides all OpenAI family defaults
- `OPENAI_DEFAULT_HAIKU_MODEL`
- `OPENAI_DEFAULT_SONNET_MODEL`
- `OPENAI_DEFAULT_OPUS_MODEL`
- `CLAUDE_CODE_SUBAGENT_MODEL` overrides subagent selection directly

Current subagent behavior:

- explicit config wins
- if OpenAI family defaults are not configured, bare subagent aliases such as `haiku`, `sonnet`, and `opus` inherit the parent model
- this avoids silently falling back to provider-specific guesses like `gpt-4o-mini`

Recommended minimal OpenAI-compatible setup:

```powershell
$env:OPENAI_BASE_URL='http://127.0.0.1:8317/v1'
$env:OPENAI_API_KEY='YOUR_KEY'
$env:CLAUDE_CODE_USE_OPENAI='1'
$env:OPENAI_MODEL='gpt-5.4'
```
