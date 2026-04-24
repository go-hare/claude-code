import { describe, expect, test } from 'bun:test'
import { parseStructuredJSONObject } from '../structuredResponse.js'

describe('parseStructuredJSONObject', () => {
  test('parses direct JSON object', () => {
    expect(
      parseStructuredJSONObject('{"reaction":"你好","name":"Pico"}'),
    ).toEqual({
      reaction: '你好',
      name: 'Pico',
    })
  })

  test('parses fenced JSON object', () => {
    expect(
      parseStructuredJSONObject(
        '```json\n{"reaction":"小家伙先围观一下。","name":"Miso"}\n```',
      ),
    ).toEqual({
      reaction: '小家伙先围观一下。',
      name: 'Miso',
    })
  })

  test('parses balanced JSON object from surrounding text', () => {
    expect(
      parseStructuredJSONObject(
        '好的，结果如下： {"name":"Pico","personality":"Warm and nerdy."}',
      ),
    ).toEqual({
      name: 'Pico',
      personality: 'Warm and nerdy.',
    })
  })

  test('returns null for non-JSON plain text', () => {
    expect(parseStructuredJSONObject('我这小仙人掌先不扎人。')).toBeNull()
  })
})
