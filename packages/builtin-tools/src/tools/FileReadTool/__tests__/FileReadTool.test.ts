import { describe, expect, test } from 'bun:test'

import { FileReadTool, normalizePagesInput } from '../FileReadTool.js'

describe('FileReadTool pages input', () => {
  test('normalizes blank pages to undefined', () => {
    expect(normalizePagesInput('')).toBeUndefined()
    expect(normalizePagesInput('   ')).toBeUndefined()
    expect(normalizePagesInput(' 1-3 ')).toBe('1-3')
  })

  test('accepts blank pages during validation', async () => {
    const result = await FileReadTool.validateInput?.(
      {
        file_path: '/tmp/example.json',
        pages: '',
      },
      {
        getAppState: () => ({
          toolPermissionContext: {
            mode: 'default',
            alwaysAllowRules: {},
            alwaysDenyRules: {},
            additionalDirectories: [],
          },
        }),
      } as any,
    )

    expect(result).toEqual({ result: true })
  })
})
