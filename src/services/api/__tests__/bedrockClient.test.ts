import { describe, expect, test } from 'bun:test'
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'
import { BedrockClient } from '../bedrockClient.js'

type Captured = {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

function makeCaptureFetch(): {
  fetch: typeof fetch
  get(): Captured | null
} {
  let captured: Captured | null = null

  const capture = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const req = new Request(input as RequestInfo, init)
    const body = await req.clone().text()
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    captured = { url: req.url, method: req.method, headers, body }
    const streamBody =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m","type":"message","role":"assistant","content":[],"model":"x","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":0,"output_tokens":0}}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'
    return new Response(streamBody, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  }

  return { fetch: capture as unknown as typeof fetch, get: () => captured }
}

const BEDROCK_ARGS = {
  awsRegion: 'us-east-1',
  awsAccessKey: 'AKIAIOSFODNN7EXAMPLE',
  awsSecretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
}

const REQUEST_PARAMS = {
  model: 'anthropic.claude-opus-4-7',
  max_tokens: 10,
  messages: [{ role: 'user' as const, content: 'hi' }],
  betas: ['interleaved-thinking-2025-05-14', 'effort-2025-11-24'],
  stream: true as const,
}

async function dispatch(client: AnthropicBedrock): Promise<void> {
  try {
    const stream = await client.beta.messages.create(REQUEST_PARAMS)
    for await (const _chunk of stream) {
      // Drain stream to force request dispatch.
    }
  } catch {
    // Captured request shape is the only assertion target here.
  }
}

describe('BedrockClient', () => {
  test('AnthropicBedrock still emits anthropic_beta in the request body', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new AnthropicBedrock({
      ...BEDROCK_ARGS,
      fetch: captureFetch,
    })

    await dispatch(client)

    const captured = get()
    expect(captured).not.toBeNull()
    const body = JSON.parse(captured!.body) as Record<string, unknown>
    expect('anthropic_beta' in body).toBe(true)
  })

  test('BedrockClient strips anthropic_beta from the request body', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })

    await dispatch(client)

    const captured = get()
    expect(captured).not.toBeNull()
    const body = JSON.parse(captured!.body) as Record<string, unknown>
    expect('anthropic_beta' in body).toBe(false)
  })

  test('BedrockClient preserves the anthropic-beta header', async () => {
    const { fetch: captureFetch, get } = makeCaptureFetch()
    const client = new BedrockClient({ ...BEDROCK_ARGS, fetch: captureFetch })

    await dispatch(client)

    const captured = get()
    expect(captured).not.toBeNull()
    expect(captured!.headers['anthropic-beta']).toBe(
      'interleaved-thinking-2025-05-14,effort-2025-11-24',
    )
  })
})
