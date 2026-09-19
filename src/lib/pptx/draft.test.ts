import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyPptxDraft } from './model'
import { getPptxDraftImageIds, PPTX_DRAFT_STORAGE_KEY } from './draft'

function createLocalStorageMock() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  }
}

describe('PPTX draft image references', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns image IDs retained by the persisted PPTX draft', () => {
    const localStorage = createLocalStorageMock()
    vi.stubGlobal('window', { localStorage })
    const draft = createEmptyPptxDraft()
    draft.pages.push({
      id: 'page-1',
      imageId: 'image-1',
      name: 'source.png',
      mimeType: 'image/png',
      bytes: 10,
      width: 2,
      height: 2,
      addedAt: 1,
    })
    localStorage.setItem(PPTX_DRAFT_STORAGE_KEY, JSON.stringify(draft))

    expect(getPptxDraftImageIds()).toEqual(['image-1'])
  })
})
