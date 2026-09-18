import { createEmptyPptxDraft, normalizePptxDraft, type PptxProjectDraft } from './model'

/** Metadata-only persistence. Image bytes stay in IndexedDB, never localStorage. */
export const PPTX_DRAFT_STORAGE_KEY = 'gpt-image-playground:pptx-project-draft:v1'

export function loadPptxDraft(): PptxProjectDraft {
  if (typeof window === 'undefined') return createEmptyPptxDraft()
  try {
    const raw = window.localStorage.getItem(PPTX_DRAFT_STORAGE_KEY)
    return raw ? normalizePptxDraft(JSON.parse(raw)) : createEmptyPptxDraft()
  } catch {
    return createEmptyPptxDraft()
  }
}

export function savePptxDraft(draft: PptxProjectDraft): void {
  if (typeof window === 'undefined') return
  try {
    const normalized = normalizePptxDraft(draft)
    window.localStorage.setItem(PPTX_DRAFT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Quota/private browsing errors must not break the workbench.
  }
}

export function clearPptxDraft(): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(PPTX_DRAFT_STORAGE_KEY) } catch { /* noop */ }
}
