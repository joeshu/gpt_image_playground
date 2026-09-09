import { describe, expect, it } from 'vitest'
import { normalizeAgentInputDraft } from './inputDraftState'
import { attachmentKind, validateAgentAttachment } from './agentAttachments'

describe('agent attachments', () => {
  it('accepts supported text and document files but rejects zip', () => {
    expect(attachmentKind(new File(['x'], 'brief.md', { type: 'text/markdown' }))).toBe('text')
    expect(attachmentKind(new File(['x'], 'brief.pdf', { type: 'application/pdf' }))).toBe('file')
    expect(attachmentKind(new File(['x'], 'archive.zip', { type: 'application/zip' }))).toBeNull()
  })

  it('enforces the 512 KiB text limit', () => {
    const file = new File([new Uint8Array(512 * 1024 + 1)], 'large.txt', { type: 'text/plain' })
    expect(() => validateAgentAttachment(file)).toThrow(/512KB/)
  })

  it('keeps draft metadata free of binary content', () => {
    const draft = normalizeAgentInputDraft({
      prompt: 'read it',
      inputImages: [],
      attachments: [{ id: 'att-1', name: 'brief.pdf', mimeType: 'application/pdf', size: 3, kind: 'file', createdAt: 1, blob: new Blob(['secret']) }],
      maskDraft: null,
      maskEditorImageId: null,
    })
    expect(draft.attachments).toEqual([{ id: 'att-1', name: 'brief.pdf', mimeType: 'application/pdf', size: 3, kind: 'file', createdAt: 1 }])
    expect(JSON.stringify(draft)).not.toContain('secret')
  })
})
