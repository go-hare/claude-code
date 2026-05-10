import { createDirectConnectSession } from '../src/server/createDirectConnectSession.js'
import { runConnectHeadless } from '../src/server/connectHeadless.js'

const prompt =
  process.argv.slice(2).join(' ').trim() ||
  'Reply with exactly: kernel-direct-ok'

const serverUrl =
  process.env.KERNEL_DIRECT_SERVER_URL || 'http://127.0.0.1:8318'
const authToken = process.env.KERNEL_DIRECT_AUTH_TOKEN
const outputFormat = process.env.KERNEL_DIRECT_OUTPUT_FORMAT || 'text'

async function main(): Promise<void> {
  const session = await createDirectConnectSession({
    serverUrl,
    authToken,
    cwd: process.cwd(),
  })

  await runConnectHeadless(session.config, prompt, outputFormat, false)
}

await main()
