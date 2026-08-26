import { describe, expect, it } from 'vitest'
import type { AgentConversation, TaskRecord } from '../types'
import { calculateAppStorageUsage, collectReferencedImageIds, getDataUrlBytes } from './storageUsage'

describe('app storage usage', () => {
  it('calculates base64 payload bytes without counting the data URL header', () => {
    expect(getDataUrlBytes('data:text/plain;base64,SGVsbG8=')).toBe(5)
  })

  it('collects image references across tasks, conversations, and drafts', () => {
    const task = {
      inputImageIds: ['task-input'],
      outputImages: ['task-output'],
      transparentOriginalImages: ['task-original'],
      streamPartialImageIds: ['task-partial'],
      maskTargetImageId: 'task-mask-target',
      maskImageId: 'task-mask',
    } as TaskRecord
    const conversation = {
      rounds: [{
        inputImageIds: ['round-input'],
        maskTargetImageId: 'round-mask-target',
        maskImageId: 'round-mask',
      }],
      messages: [{
        inputImageIds: ['message-input'],
        maskTargetImageId: 'message-mask-target',
        maskImageId: 'message-mask',
      }],
    } as AgentConversation

    const ids = collectReferencedImageIds({
      tasks: [task],
      agentConversations: [conversation],
      inputImages: [{ id: 'current-input', dataUrl: '' }],
      maskDraft: { targetImageId: 'current-mask-target', maskDataUrl: '', updatedAt: 0 },
      maskEditorImageId: 'current-editor',
      galleryInputDraft: null,
      agentInputDrafts: {},
    })

    expect(ids).toEqual(new Set([
      'current-input',
      'current-mask-target',
      'current-editor',
      'task-input',
      'task-output',
      'task-original',
      'task-partial',
      'task-mask-target',
      'task-mask',
      'round-input',
      'round-mask-target',
      'round-mask',
      'message-input',
      'message-mask-target',
      'message-mask',
    ]))
  })

  it('counts only unreferenced images and thumbnails as safe cleanup', () => {
    const usage = calculateAppStorageUsage(
      [
        { id: 'kept', dataUrl: 'data:text/plain;base64,SGVsbG8=' },
        { id: 'orphan', dataUrl: 'data:text/plain;base64,QQ==' },
      ],
      [
        { id: 'kept', thumbnailDataUrl: 'data:text/plain;base64,Qg==' },
        { id: 'thumbnail-only', thumbnailDataUrl: 'data:text/plain;base64,Qw==' },
      ],
      new Set(['kept']),
    )

    expect(usage.imageBytes).toBe(6)
    expect(usage.thumbnailBytes).toBe(2)
    expect(usage.orphanCount).toBe(2)
    expect(usage.orphanBytes).toBe(2)
  })
})
