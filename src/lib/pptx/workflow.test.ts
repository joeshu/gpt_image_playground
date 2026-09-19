import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPptxWorkflow, getPptxSourceKey, getPptxWorkflowImageIds, loadPptxWorkflow, PPTX_WORKFLOW_STORAGE_KEY, savePptxWorkflow } from './workflow'

function localStorageMock() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) }
}

describe('PPTX staged workflow persistence', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('restores cached analysis only for the same ordered sources', () => {
    const localStorage = localStorageMock(); vi.stubGlobal('window', { localStorage })
    const key = getPptxSourceKey([{ id: 'page-1', imageId: 'image-1' }])
    const workflow = createPptxWorkflow(key); workflow.stage = 'review'; workflow.specs = [{ schemaVersion: 1, canvas: { widthPx: 10, heightPx: 10, aspectRatio: 1 }, elements: [], readingOrder: [], warnings: [] }]
    savePptxWorkflow(workflow)
    expect(loadPptxWorkflow(key).specs).toHaveLength(1)
    expect(loadPptxWorkflow('different').specs).toHaveLength(0)
  })

  it('retains generated asset image IDs for orphan cleanup', () => {
    const localStorage = localStorageMock(); vi.stubGlobal('window', { localStorage })
    localStorage.setItem(PPTX_WORKFLOW_STORAGE_KEY, JSON.stringify({ version: 1, sourceKey: 'x', stage: 'assets', specs: [], updatedAt: 1, assets: [{ assetId: 'a', pageIndex: 0, prompt: 'x', elementIds: [], status: 'ready', imageId: 'generated-1' }, { assetId: 'b', pageIndex: 0, prompt: 'y', elementIds: [], status: 'failed' }] }))
    expect(getPptxWorkflowImageIds()).toEqual(['generated-1'])
  })
})
