import type { PptxSlideSpec } from './model'

export type PptxWorkflowStage = 'source' | 'analysis' | 'review' | 'assets' | 'compile'
export type PptxAssetStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'skipped'

export interface PptxWorkflowAsset {
  assetId: string
  pageIndex: number
  prompt: string
  elementIds: string[]
  status: PptxAssetStatus
  imageId?: string
  error?: string
}

export interface PptxWorkflowState {
  version: 1
  sourceKey: string
  stage: PptxWorkflowStage
  specs: PptxSlideSpec[]
  assets: PptxWorkflowAsset[]
  reviewedAt?: number
  updatedAt: number
}

export const PPTX_WORKFLOW_STORAGE_KEY = 'gpt-image-playground:pptx-workflow:v1'

export function getPptxSourceKey(pages: Array<{ id: string; imageId: string }>): string {
  return pages.map((page) => `${page.id}:${page.imageId}`).join('|')
}

export function createPptxWorkflow(sourceKey = ''): PptxWorkflowState {
  return { version: 1, sourceKey, stage: 'source', specs: [], assets: [], updatedAt: Date.now() }
}

export function loadPptxWorkflow(sourceKey: string): PptxWorkflowState {
  if (typeof window === 'undefined') return createPptxWorkflow(sourceKey)
  try {
    const raw = window.localStorage.getItem(PPTX_WORKFLOW_STORAGE_KEY)
    if (!raw) return createPptxWorkflow(sourceKey)
    const value = JSON.parse(raw) as Partial<PptxWorkflowState>
    if (value.version !== 1 || value.sourceKey !== sourceKey || !Array.isArray(value.specs) || !Array.isArray(value.assets)) return createPptxWorkflow(sourceKey)
    const stage: PptxWorkflowStage = ['source', 'analysis', 'review', 'assets', 'compile'].includes(String(value.stage)) ? value.stage as PptxWorkflowStage : 'source'
    return { version: 1, sourceKey, stage, specs: value.specs, assets: value.assets, reviewedAt: Number(value.reviewedAt) || undefined, updatedAt: Number(value.updatedAt) || Date.now() }
  } catch { return createPptxWorkflow(sourceKey) }
}

export function savePptxWorkflow(state: PptxWorkflowState): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PPTX_WORKFLOW_STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() })) } catch { /* quota/private mode */ }
}

export function clearPptxWorkflow(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(PPTX_WORKFLOW_STORAGE_KEY) } catch { /* noop */ }
}

export function getPptxWorkflowImageIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(PPTX_WORKFLOW_STORAGE_KEY) || '{}') as Partial<PptxWorkflowState>
    return Array.isArray(value.assets) ? value.assets.flatMap((asset) => typeof asset?.imageId === 'string' ? [asset.imageId] : []) : []
  } catch { return [] }
}
