import { describe, expect, test } from 'bun:test'

import { parseBridgePermissionResponse } from '../bridgePermissionCallbacks.js'
import type { ProtocolControlResponse } from 'src/types/protocol/controlTypes.js'

describe('parseBridgePermissionResponse', () => {
  test('passes through allow responses', () => {
    const message: ProtocolControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: {
          behavior: 'allow',
          updatedPermissions: [
            { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
          ],
        },
      },
    }

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'allow',
      updatedPermissions: [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ],
    })
  })

  test('preserves host decision metadata on allow responses', () => {
    const message: ProtocolControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: {
          behavior: 'allow',
          updatedInput: { command: 'pwd' },
          toolUseID: 'tool-use-1',
          decisionClassification: 'user_permanent',
        },
      },
    }

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'allow',
      updatedInput: { command: 'pwd' },
      toolUseID: 'tool-use-1',
      decisionClassification: 'user_permanent',
    })
  })

  test('maps error responses with feedback to deny', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-2',
        error: 'Permission denied by user',
        response: { behavior: 'deny' },
        message: 'Need more detail',
      },
    } as unknown as ProtocolControlResponse

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'deny',
      message: 'Need more detail',
    })
  })

  test('falls back to error text when deny feedback is absent', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-3',
        error: 'Permission denied by user',
      },
    } as unknown as ProtocolControlResponse

    expect(parseBridgePermissionResponse(message)).toEqual({
      behavior: 'deny',
      message: 'Permission denied by user',
    })
  })

  test('returns null for unrelated control responses', () => {
    const message = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: 'req-4',
        error: '',
      },
    } as unknown as ProtocolControlResponse

    expect(parseBridgePermissionResponse(message)).toBeNull()
  })
})
