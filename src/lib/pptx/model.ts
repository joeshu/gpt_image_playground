export type PptxMode = 'quick-pack' | 'semantic-rebuild'
export type PptxAspectRatio = 'source' | '16:9' | '4:3'
export type PptxFitMode = 'contain' | 'cover'
export type PptxJobStatus =
  | 'draft'
  | 'validating'
  | 'building'
  | 'rendering'
  | 'ready'
  | 'failed'
  | 'cancelled'

export interface PptxSourcePage {
  id: string
  imageId: string
  name: string
  mimeType: string
  /** 原始二进制字节数；旧草稿可能为 0，生成前会再次读取真实 Blob。 */
  bytes: number
  width: number
  height: number
  addedAt: number
}

export interface PptxProjectOptions {
  mode: PptxMode
  aspectRatio: PptxAspectRatio
  fit: PptxFitMode
  backgroundColor: string
  fileName: string
}

export interface PptxProjectDraft {
  version: 1
  pages: PptxSourcePage[]
  options: PptxProjectOptions
  updatedAt: number
}

export interface PptxSlideSize {
  widthIn: number
  heightIn: number
  widthEmu: number
  heightEmu: number
  ratio: number
}

export type PptxPhaseStatus = 'passed' | 'warning' | 'blocked' | 'not-run' | 'not-applicable'

export interface PptxBuildReport {
  version: 1
  mode: PptxMode
  status: 'ready' | 'failed'
  createdAt: number
  sourcePageCount: number
  slideSize: { widthIn: number; heightIn: number; ratio: number }
  pages: Array<{
    pageId: string
    imageId: string
    index: number
    name: string
    editability: 'full-page-image' | 'mixed-native-and-source-assets'
    warnings: string[]
  }>
  phases: {
    inputPrepared: PptxPhaseStatus
    visualInventory: PptxPhaseStatus
    assetClassification: PptxPhaseStatus
    imagegenAssets: PptxPhaseStatus
    textFit: PptxPhaseStatus
    pptxBuilt: PptxPhaseStatus
    renderQa: PptxPhaseStatus
    localCropQa: PptxPhaseStatus
    validation: PptxPhaseStatus
  }
  limitations: string[]
}

export interface PptxElementBox {
  /** Normalized coordinates in the 0..1 range. */
  x: number
  y: number
  width: number
  height: number
}

export interface PptxTextStyle {
  fontFamily?: string
  fontSizePt?: number
  color?: string
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  verticalAnchor?: 'top' | 'middle' | 'bottom'
  marginPt?: number
}

export type PptxShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'chevron'
  | 'rightArrow'
  | 'leftArrow'
  | 'upArrow'
  | 'downArrow'
  | 'hexagon'
  | 'diamond'

export type PptxArrowhead = 'triangle' | 'stealth' | 'diamond' | 'oval' | 'open'

export type PptxSlideElement =
  | {
      id: string
      type: 'text'
      box: PptxElementBox
      text: string
      style?: PptxTextStyle
      confidence?: number
      editable?: boolean
    }
  | {
      id: string
      type: 'rect'
      box: PptxElementBox
      fill?: string
      line?: string
      radius?: number
      confidence?: number
    }
  | {
      id: string
      type: 'line'
      box: PptxElementBox
      line?: string
      widthPt?: number
      headEnd?: PptxArrowhead
      tailEnd?: PptxArrowhead
      flipH?: boolean
      flipV?: boolean
      confidence?: number
    }
  | {
      id: string
      type: 'shape'
      shape: PptxShapeKind
      box: PptxElementBox
      fill?: string
      line?: string
      widthPt?: number
      rotation?: number
      confidence?: number
    }
  | {
      id: string
      type: 'image'
      box: PptxElementBox
      sourceBox?: PptxElementBox
      classification: 'source_crop' | 'user_asset' | 'imagegen_asset'
      assetId?: string
      confidence?: number
      editable?: boolean
      fallbackReason?: string
    }

export interface PptxSlideSpec {
  schemaVersion: 1
  canvas: { widthPx: number; heightPx: number; aspectRatio: number }
  background?: { color?: string }
  elements: PptxSlideElement[]
  readingOrder: string[]
  warnings: string[]
}

export function normalizeElementBox(value: unknown): PptxElementBox | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const numbers = ['x', 'y', 'width', 'height'].map((key) => Number(record[key]))
  if (numbers.some((item) => !Number.isFinite(item))) return null
  const [x, y, width, height] = numbers
  if (width <= 0 || height <= 0) return null
  const clampedX = Math.min(1, Math.max(0, x))
  const clampedY = Math.min(1, Math.max(0, y))
  return {
    x: clampedX,
    y: clampedY,
    width: Math.min(1 - clampedX, Math.max(0.001, width)),
    height: Math.min(1 - clampedY, Math.max(0.001, height)),
  }
}

export function normalizeSlideSpec(value: unknown, fallback: Pick<PptxSourcePage, 'width' | 'height'>): PptxSlideSpec {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const canvasRecord = record.canvas && typeof record.canvas === 'object' ? record.canvas as Record<string, unknown> : {}
  const widthPx = Math.max(1, Math.round(Number(canvasRecord.widthPx) || fallback.width))
  const heightPx = Math.max(1, Math.round(Number(canvasRecord.heightPx) || fallback.height))
  const rawElements = Array.isArray(record.elements) ? record.elements : []
  const elements: PptxSlideElement[] = []
  for (const raw of rawElements.slice(0, 240)) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `element-${elements.length + 1}`
    const type = item.type
    const box = normalizeElementBox(item.box)
    if (!box || (type !== 'text' && type !== 'rect' && type !== 'line' && type !== 'shape' && type !== 'image')) continue
    const confidence = normalizeConfidence(item.confidence)
    if (type === 'text') {
      const text = typeof item.text === 'string' ? item.text.slice(0, 5000) : ''
      if (!text.trim()) continue
      const style = normalizeTextStyle(item.style)
      elements.push({ id, type, box, text, style, confidence, editable: item.editable !== false })
    } else if (type === 'rect') {
      elements.push({ id, type, box, fill: normalizeColor(item.fill), line: normalizeColor(item.line), radius: Number.isFinite(Number(item.radius)) ? Math.min(1, Math.max(0, Number(item.radius))) : undefined, confidence })
    } else if (type === 'line') {
      elements.push({
        id,
        type,
        box,
        line: normalizeColor(item.line),
        widthPt: Number.isFinite(Number(item.widthPt)) ? Math.min(12, Math.max(0.25, Number(item.widthPt))) : undefined,
        headEnd: normalizeArrowhead(item.headEnd),
        tailEnd: normalizeArrowhead(item.tailEnd),
        flipH: item.flipH === true,
        flipV: item.flipV === true,
        confidence,
      })
    } else if (type === 'shape') {
      const shape = normalizeShapeKind(item.shape)
      if (!shape) continue
      const rotation = Number(item.rotation)
      elements.push({
        id,
        type,
        shape,
        box,
        fill: normalizeColor(item.fill),
        line: normalizeColor(item.line),
        widthPt: Number.isFinite(Number(item.widthPt)) ? Math.min(12, Math.max(0.25, Number(item.widthPt))) : undefined,
        rotation: Number.isFinite(rotation) ? Math.max(-360, Math.min(360, rotation)) : undefined,
        confidence,
      })
    } else {
      const classification = item.classification === 'user_asset' || item.classification === 'imagegen_asset' ? item.classification : 'source_crop'
      const sourceBox = normalizeElementBox(item.sourceBox) ?? (classification === 'source_crop' ? box : undefined)
      elements.push({
        id,
        type,
        box,
        sourceBox,
        classification,
        assetId: typeof item.assetId === 'string' ? item.assetId.slice(0, 100) : undefined,
        confidence,
        editable: item.editable !== false,
        fallbackReason: typeof item.fallbackReason === 'string' ? item.fallbackReason.slice(0, 240) : undefined,
      })
    }
  }
  const readingOrder = Array.isArray(record.readingOrder) ? record.readingOrder.filter((item): item is string => typeof item === 'string').slice(0, 240) : elements.filter((item) => item.type === 'text').map((item) => item.id)
  const backgroundRecord = record.background && typeof record.background === 'object' ? record.background as Record<string, unknown> : {}
  return {
    schemaVersion: 1,
    canvas: { widthPx, heightPx, aspectRatio: widthPx / heightPx },
    background: { color: normalizeColor(backgroundRecord.color) ?? '#FFFFFF' },
    elements,
    readingOrder,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === 'string').slice(0, 30) : [],
  }
}

function normalizeConfidence(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number > 1 ? number / 100 : number)) : undefined
}

const PPTX_SHAPE_KINDS: readonly PptxShapeKind[] = ['rect', 'roundRect', 'ellipse', 'chevron', 'rightArrow', 'leftArrow', 'upArrow', 'downArrow', 'hexagon', 'diamond']
const PPTX_ARROWHEADS: readonly PptxArrowhead[] = ['triangle', 'stealth', 'diamond', 'oval', 'open']

function normalizeShapeKind(value: unknown): PptxShapeKind | null {
  return typeof value === 'string' && PPTX_SHAPE_KINDS.includes(value as PptxShapeKind) ? value as PptxShapeKind : null
}

function normalizeArrowhead(value: unknown): PptxArrowhead | undefined {
  return typeof value === 'string' && PPTX_ARROWHEADS.includes(value as PptxArrowhead) ? value as PptxArrowhead : undefined
}

function normalizeColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined
}

function normalizeTextStyle(value: unknown): PptxTextStyle | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const align = record.align === 'center' || record.align === 'right' ? record.align : 'left'
  const verticalAnchor = record.verticalAnchor === 'middle' || record.verticalAnchor === 'bottom' ? record.verticalAnchor : 'top'
  const fontSizePt = Number(record.fontSizePt)
  const marginPt = Number(record.marginPt)
  return {
    fontFamily: typeof record.fontFamily === 'string' && record.fontFamily.trim() ? record.fontFamily.trim().slice(0, 80) : undefined,
    fontSizePt: Number.isFinite(fontSizePt) ? Math.min(96, Math.max(6, fontSizePt)) : undefined,
    color: normalizeColor(record.color),
    bold: record.bold === true,
    italic: record.italic === true,
    align,
    verticalAnchor,
    marginPt: Number.isFinite(marginPt) ? Math.min(24, Math.max(0, marginPt)) : undefined,
  }
}

export const PPTX_MAX_SOURCE_PAGES = 20
export const PPTX_MAX_TOTAL_BYTES = 100 * 1024 * 1024
export const PPTX_MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const PPTX_DEFAULT_OPTIONS: PptxProjectOptions = {
  mode: 'quick-pack',
  aspectRatio: '16:9',
  fit: 'contain',
  backgroundColor: '#FFFFFF',
  fileName: '图片转PPTX',
}

export function createPptxPageId(): string {
  const cryptoObject = globalThis.crypto
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID()
  return `pptx-page-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyPptxDraft(): PptxProjectDraft {
  return {
    version: 1,
    pages: [],
    options: { ...PPTX_DEFAULT_OPTIONS },
    updatedAt: Date.now(),
  }
}

export function normalizePptxOptions(value: unknown): PptxProjectOptions {
  if (!value || typeof value !== 'object') return { ...PPTX_DEFAULT_OPTIONS }
  const record = value as Partial<PptxProjectOptions>
  const mode: PptxMode = record.mode === 'semantic-rebuild' ? 'semantic-rebuild' : 'quick-pack'
  const aspectRatio: PptxAspectRatio = record.aspectRatio === 'source' || record.aspectRatio === '4:3' ? record.aspectRatio : '16:9'
  const fit: PptxFitMode = record.fit === 'cover' ? 'cover' : 'contain'
  const backgroundColor = typeof record.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(record.backgroundColor)
    ? record.backgroundColor.toUpperCase()
    : PPTX_DEFAULT_OPTIONS.backgroundColor
  const fileName = typeof record.fileName === 'string' && record.fileName.trim()
    ? record.fileName.trim().slice(0, 80)
    : PPTX_DEFAULT_OPTIONS.fileName
  return { mode, aspectRatio, fit, backgroundColor, fileName }
}

export function normalizePptxPages(value: unknown): PptxSourcePage[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, PPTX_MAX_SOURCE_PAGES).flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Partial<PptxSourcePage>
    if (typeof record.id !== 'string' || typeof record.imageId !== 'string' || typeof record.name !== 'string') return []
    const width = Number(record.width)
    const height = Number(record.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
    return [{
      id: record.id,
      imageId: record.imageId,
      name: record.name.slice(0, 180),
      mimeType: typeof record.mimeType === 'string' ? record.mimeType : 'image/png',
      bytes: Math.max(0, Math.round(Number(record.bytes) || 0)),
      width: Math.round(width),
      height: Math.round(height),
      addedAt: Number.isFinite(Number(record.addedAt)) ? Number(record.addedAt) : Date.now(),
    }]
  })
}

export function normalizePptxDraft(value: unknown): PptxProjectDraft {
  if (!value || typeof value !== 'object') return createEmptyPptxDraft()
  const record = value as Partial<PptxProjectDraft>
  return {
    version: 1,
    pages: normalizePptxPages(record.pages),
    options: normalizePptxOptions(record.options),
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : Date.now(),
  }
}

export function validatePptxPages(pages: PptxSourcePage[]): string[] {
  const issues: string[] = []
  if (!pages.length) issues.push('请至少添加一张图片')
  if (pages.length > PPTX_MAX_SOURCE_PAGES) issues.push(`最多支持 ${PPTX_MAX_SOURCE_PAGES} 页`)

  let totalBytes = 0
  for (const page of pages) {
    const bytes = Math.max(0, page.bytes)
    if (bytes > PPTX_MAX_SOURCE_BYTES) issues.push(`“${page.name}”超过单张 ${Math.round(PPTX_MAX_SOURCE_BYTES / 1024 / 1024)} MB 限制`)
    totalBytes += bytes
  }
  if (totalBytes > PPTX_MAX_TOTAL_BYTES) issues.push(`图片总大小不能超过 ${Math.round(PPTX_MAX_TOTAL_BYTES / 1024 / 1024)} MB`)
  return [...new Set(issues)]
}

export function getPptxSlideSize(aspectRatio: PptxAspectRatio, page?: Pick<PptxSourcePage, 'width' | 'height'>): PptxSlideSize {
  const ratio = aspectRatio === '4:3'
    ? 4 / 3
    : aspectRatio === '16:9'
      ? 16 / 9
      : page && page.width > 0 && page.height > 0
        ? page.width / page.height
        : 16 / 9
  const widthIn = 13.333333
  const heightIn = widthIn / ratio
  return {
    widthIn,
    heightIn,
    widthEmu: Math.round(widthIn * 914400),
    heightEmu: Math.round(heightIn * 914400),
    ratio,
  }
}

export function updatePptxDraft(draft: PptxProjectDraft, patch: Partial<Pick<PptxProjectDraft, 'pages' | 'options'>>): PptxProjectDraft {
  return {
    ...draft,
    ...patch,
    options: patch.options ? normalizePptxOptions(patch.options) : draft.options,
    pages: patch.pages ? normalizePptxPages(patch.pages) : draft.pages,
    updatedAt: Date.now(),
  }
}
