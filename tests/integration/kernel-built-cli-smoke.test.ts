import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'child_process'
import { join } from 'path'

const repoRoot = join(import.meta.dir, '../..')
const promptText = 'Reply with exactly BUILT_CLI_SMOKE_OK'
const expectedText = 'BUILT_CLI_SMOKE_OK'
const shouldRunBuiltCliSmoke = process.env.RUN_BUILT_CLI_SMOKE === '1'

type SmokeReport = {
  code: number | null
  kind: string
  lineCount: number
  resultLine?: string
  stderr: string
  timedOut: boolean
}

type HarnessReport = {
  bunResult: SmokeReport
  nodeResult: SmokeReport
  requestCount: number
  firstRequest: Record<string, unknown> | null
}

function buildSmokeRunnerScript(): string {
  return `
const http = require("http");
const { spawn } = require("child_process");

const promptText = ${JSON.stringify(promptText)};
const expectedText = ${JSON.stringify(expectedText)};

function createServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      requests.push(JSON.parse(body));
      const chunks = [
        {
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: expectedText },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl-test",
          object: "chat.completion.chunk",
          created: 1,
          model: "gpt-5.4",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 11,
            completion_tokens: 7,
            total_tokens: 18,
          },
        },
      ];

      res.writeHead(200, {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      });
      for (const chunk of chunks) {
        res.write(\`data: \${JSON.stringify(chunk)}\\n\\n\`);
      }
      res.end("data: [DONE]\\n\\n");
    });
  });

  return { requests, server };
}

function createChildEnv(overrides) {
  const env = {
    ...process.env,
    ...overrides,
    NODE_ENV: "production",
  };
  delete env.BUN_TEST;
  return env;
}

async function run(kind, cmd, args, prompt, env) {
  return await new Promise(resolve => {
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.stdin.write(prompt);
    child.stdin.end();

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        child.kill("SIGKILL");
      }, 2000).unref?.();
    }, 30000);

    child.on("close", code => {
      clearTimeout(timeout);
      const lines = stdout.split("\\n").filter(Boolean);
      resolve({
        code,
        kind,
        lineCount: lines.length,
        resultLine: lines.find(line => line.includes('"type":"result"')),
        stderr,
        timedOut,
      });
    });
  });
}

(async () => {
  const { requests, server } = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    const sharedEnv = createChildEnv({
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1",
      CLAUDE_CODE_USE_OPENAI: "1",
      NO_COLOR: "1",
      OPENAI_API_KEY: "test-openai-key",
      OPENAI_BASE_URL: \`http://127.0.0.1:\${port}/v1\`,
      OPENAI_DEFAULT_HAIKU_MODEL: "gpt-5.4",
      OPENAI_DEFAULT_OPUS_MODEL: "gpt-5.4",
      OPENAI_DEFAULT_SONNET_MODEL: "gpt-5.4",
      OPENAI_MODEL: "gpt-5.4",
    });

    const bunResult = await run(
      "built-bun-stdin",
      "bun",
      [
        "dist/cli-bun.js",
        "-p",
        "--disable-slash-commands",
        "--tools",
        "",
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "1",
        "--model",
        "gpt-5.4",
      ],
      promptText,
      sharedEnv,
    );

    const nodeResult = await run(
      "built-node-stdin",
      "node",
      [
        "dist/cli-node.js",
        "-p",
        "--disable-slash-commands",
        "--tools",
        "",
        "--output-format",
        "stream-json",
        "--verbose",
        "--max-turns",
        "1",
        "--model",
        "gpt-5.4",
      ],
      promptText,
      sharedEnv,
    );

    process.stdout.write(
      JSON.stringify({
        bunResult,
        nodeResult,
        requestCount: requests.length,
        firstRequest: requests[0] ?? null,
      }),
    );
  } finally {
    server.close();
  }
})();
`
}

function assertSmokeReport(report: SmokeReport): void {
  expect(report.timedOut).toBe(false)
  expect(report.code).toBe(0)
  expect(report.stderr).toBe('')
  expect(report.lineCount).toBeGreaterThan(0)
  expect(report.resultLine).toContain('"subtype":"success"')
  expect(report.resultLine).toContain(`"result":"${expectedText}"`)
}

describe('kernel built CLI smoke', () => {
  const smokeTest = shouldRunBuiltCliSmoke ? test : test.skip

  smokeTest(
    'built bun/node CLI complete a headless print turn against a local OpenAI-compatible SSE server',
    async () => {
      execFileSync('bun', ['run', 'build.ts'], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_ENV: 'production',
        },
      })

      const report = JSON.parse(
        execFileSync('node', ['-e', buildSmokeRunnerScript()], {
          cwd: repoRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
          timeout: 120_000,
        }),
      ) as HarnessReport

      assertSmokeReport(report.bunResult)
      assertSmokeReport(report.nodeResult)
      expect(report.requestCount).toBe(2)
      expect(report.firstRequest?.stream).toBe(true)
      expect(report.firstRequest?.model).toBe('gpt-5.4')
    },
    { timeout: 150_000 },
  )
})
