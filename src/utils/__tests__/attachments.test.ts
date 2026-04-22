import { describe, expect, test } from 'bun:test'
import { getQueuedCommandAttachmentBatch } from '../attachments.js'

describe('getQueuedCommandAttachmentBatch', () => {
  test('keeps successful queued commands when one attachment build fails', async () => {
    const result = await getQueuedCommandAttachmentBatch([
      {
        uuid: '11111111-1111-1111-1111-111111111111' as any,
        mode: 'prompt',
        value: 'delivered prompt',
      },
      {
        uuid: '22222222-2222-2222-2222-222222222222' as any,
        mode: 'prompt',
        value: 'broken image prompt',
        pastedContents: {
          1: {
            id: 1,
            type: 'image',
            content: 'a'.repeat(8_000_000),
            mediaType: 'image/png',
          } as any,
        },
      },
    ])

    expect(result.attachments).toHaveLength(1)
    expect(result.attachments[0]).toMatchObject({
      type: 'queued_command',
      source_uuid: '11111111-1111-1111-1111-111111111111',
    })
    expect(result.attachedQueuedCommands.map(cmd => cmd.uuid)).toEqual([
      '11111111-1111-1111-1111-111111111111',
    ])
  })
})
