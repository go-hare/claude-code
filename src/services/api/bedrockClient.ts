import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk'

/**
 * Work around an upstream Bedrock SDK bug that mirrors the anthropic-beta
 * header into the JSON body as anthropic_beta. Bedrock rejects that field for
 * some Claude endpoints.
 */
type BuildRequestArg = Parameters<AnthropicBedrock['buildRequest']>[0]
type BuildRequestRet = Awaited<ReturnType<AnthropicBedrock['buildRequest']>>

export class BedrockClient extends AnthropicBedrock {
  async buildRequest(options: BuildRequestArg): Promise<BuildRequestRet> {
    const req = await super.buildRequest(options)

    const inner = (
      req as unknown as { req?: { body?: unknown; headers?: unknown } }
    )?.req
    if (!inner || typeof inner.body !== 'string' || inner.body.length === 0) {
      return req
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(inner.body) as Record<string, unknown>
    } catch {
      return req
    }

    if (!('anthropic_beta' in parsed)) {
      return req
    }

    delete parsed.anthropic_beta
    const cleanedBody = JSON.stringify(parsed)
    inner.body = cleanedBody

    const byteLen = String(new TextEncoder().encode(cleanedBody).length)
    const headers = inner.headers
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      if (headers.has('content-length')) {
        headers.set('content-length', byteLen)
      }
    } else if (headers && typeof headers === 'object') {
      const dict = headers as Record<string, string>
      if ('content-length' in dict) {
        dict['content-length'] = byteLen
      }
    }

    return req
  }
}
