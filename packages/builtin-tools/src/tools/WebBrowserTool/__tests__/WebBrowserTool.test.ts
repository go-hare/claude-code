import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { WebBrowserTool } from '../WebBrowserTool.js'

const realFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === 'not-a-url' || !url.startsWith('http')) {
      throw new TypeError('Failed to fetch')
    }

    const body =
      '<!doctype html><html><head><title>Example Domain</title></head>' +
      '<body><h1>Example Domain</h1><p>Sample content.</p></body></html>'
    const response = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
    Object.defineProperty(response, 'url', { value: url, configurable: true })
    return response
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe('WebBrowserTool', () => {
  test('exports stable metadata', async () => {
    expect(WebBrowserTool).toBeDefined()
    expect(WebBrowserTool.name).toBe('WebBrowser')
    expect(await WebBrowserTool.description()).toContain('HTTP')
    expect(await WebBrowserTool.prompt()).toContain('Limitations')
    expect(await WebBrowserTool.prompt()).toContain('Claude-in-Chrome')
    expect(WebBrowserTool.userFacingName()).toBe('Browser')
    expect(WebBrowserTool.isReadOnly()).toBe(true)
    expect(WebBrowserTool.isConcurrencySafe()).toBe(false)
  })

  test('accepts only browser-lite actions and rejects unsupported interactions', () => {
    const schema = WebBrowserTool.inputSchema

    for (const action of ['navigate', 'screenshot']) {
      expect(
        schema.safeParse({
          url: 'https://example.com',
          action,
        }).success,
      ).toBe(true)
    }

    expect(
      schema.safeParse({
        url: 'https://example.com',
        action: 'submit',
      }).success,
    ).toBe(false)
    expect(
      schema.safeParse({
        url: 'https://example.com',
        action: 'click',
      }).success,
    ).toBe(false)
  })

  test('renders tool use and result blocks consistently', () => {
    expect(
      WebBrowserTool.renderToolUseMessage({
        url: 'https://example.com',
        action: 'screenshot',
      } as never),
    ).toBe('Browser screenshot: https://example.com')

    const block = WebBrowserTool.mapToolResultToToolResultBlockParam(
      {
        title: 'Example Domain',
        url: 'https://example.com',
        content: 'Sample content',
      },
      'tool-use-id',
    )

    expect(block.tool_use_id).toBe('tool-use-id')
    expect(block.content).toContain('Example Domain')
    expect(block.content).toContain('https://example.com')
    expect(block.content).toContain('Sample content')
  })

  test('navigate fetches page content', async () => {
    const result = await WebBrowserTool.call({
      url: 'https://example.com',
      action: 'navigate',
    } as never)

    expect(result.data.title).toBe('Example Domain')
    expect(result.data.url).toBe('https://example.com')
    expect(result.data.content).toContain('Example Domain')
    expect(result.data.content).toContain('Sample content.')
  })

  test('screenshot returns a text snapshot', async () => {
    const result = await WebBrowserTool.call({
      url: 'https://example.com',
      action: 'screenshot',
    } as never)

    expect(result.data.title).toBe('Example Domain')
    expect(result.data.content).toContain('Text snapshot')
    expect(result.data.content).toContain('Example Domain')
  })

  test('invalid URL returns an error result', async () => {
    const result = await WebBrowserTool.call({
      url: 'not-a-url',
      action: 'navigate',
    } as never)

    expect(result.data.title).toBe('Error')
    expect(result.data.content).toContain('Failed to fetch')
  })
})
