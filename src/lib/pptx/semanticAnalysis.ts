import { callPptxSemanticAnalysisApi } from '../agentApi'
import { normalizeSlideSpec, type PptxSlideElement, type PptxSlideSpec, type PptxSourcePage } from './model'
import type { ApiProfile } from '../../types'

export interface PptxSemanticAnalysisResult {
  spec: PptxSlideSpec
  rawText: string
  nativeElementCount: number
  sourceAssetCount: number
  lowConfidenceCount: number
}

const SEMANTIC_ANALYSIS_INSTRUCTIONS = `You are a senior presentation reconstruction analyst. Rebuild the attached single-slide raster image as a structured JSON SlideSpec for an editable PowerPoint compiler.

The output is not a design suggestion and not an XML document. Return ONLY one JSON object with this shape:
{
  "schemaVersion": 1,
  "canvas": {"widthPx": number, "heightPx": number},
  "background": {"color": "#RRGGBB"},
  "elements": [],
  "readingOrder": ["element-id"],
  "warnings": []
}

Coordinates for every element and every sourceBox are normalized to 0..1 relative to the complete source image. Each `box` and `sourceBox` MUST use exactly `{ "x": number, "y": number, "width": number, "height": number }`; do not abbreviate `width`/`height` as `w`/`h`. Preserve the source reading order and approximate geometry. Paint background panels and masking patches before the text or icon that sits above them.

Allowed editable native elements:
1. text: {id,type:"text",box,text,style:{fontFamily,fontSizePt,color,bold,italic,align,verticalAnchor,marginPt},confidence,editable:true}
2. rect: {id,type:"rect",box,fill,line,radius,confidence}
3. line: {id,type:"line",box,line,widthPt,headEnd,tailEnd,confidence}
4. shape: {id,type:"shape",shape,box,fill,line,widthPt,rotation,confidence}; shape is one of rect, roundRect, ellipse, chevron, rightArrow, leftArrow, upArrow, downArrow, hexagon, diamond.

Use native text for all readable titles, labels, numbers and body copy. Use native rectangles/rounded rectangles for cards, headers, pills, separators and flat-color masks. Reconstruct simple charts with native lines, ellipses and text labels; do not use a screenshot of the whole chart. Use native arrows or chevrons for visible process arrows.

Allowed non-native fallback:
5. image: {id,type:"image",box,sourceBox,classification,assetId,assetPrompt,sourceExact,confidence,editable:false,fallbackReason}. For every icon, pictogram, illustration, skyline, decorative mark, complex badge, logo-like visual, or non-native visual that is not an exact user-supplied brand file, use classification:"imagegen_asset", give it a stable assetId and a self-contained assetPrompt. The prompt must request one isolated transparent PNG with no text, labels, card frame, or background, and must describe the reference colors and geometry. Use classification:"source_crop" only for an exact user-supplied brand/logo mark that must remain unchanged; set sourceExact:true and use a tight sourceBox. source crops must never cover the whole page and must never be used for ordinary icons.

Important quality rules:
- Do not omit readable Chinese text merely because it is small.
- Do not duplicate a text region as both image and text.
- Do not use image crops for large cards, chart areas or page backgrounds.
- For text removed from the raster source, add an appropriately colored flat rect or small local background patch underneath when necessary to prevent ghosting.
- Split mixed-color title fragments into separate text elements when needed.
- For line charts, estimate data points and use one line element per segment plus small ellipse points and editable labels.
- Report confidence from 0 to 1 for every text and image; do not claim confidence for pixels you cannot read.
- Keep the result under 220 elements. Prefer faithful, editable structure over decorative over-segmentation.
- If a complex region cannot be reconstructed natively, classify it as imagegen_asset and provide assetPrompt. Never silently replace a complex visual with a screenshot crop.
- Return valid JSON only; no Markdown fences, comments or explanatory prose.`

function extractJsonObject(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('语义分析结果不是 JSON 对象')
  return trimmed.slice(start, end + 1)
}

function elementArea(element: PptxSlideElement): number {
  return element.box.width * element.box.height
}

function sourceArea(element: Extract<PptxSlideElement, { type: 'image' }>): number {
  return (element.sourceBox?.width ?? 1) * (element.sourceBox?.height ?? 1)
}

function enforceSemanticPolicy(spec: PptxSlideSpec): PptxSlideSpec {
  const warnings = [...spec.warnings]
  const elements: PptxSlideElement[] = []
  const ids = new Set<string>()
  for (const element of spec.elements) {
    let next = element
    if (ids.has(element.id)) {
      warnings.push(`丢弃重复元素 ID：${element.id}`)
      continue
    }
    ids.add(element.id)
    if (element.type === 'image') {
      if (element.classification === 'imagegen_asset') {
        if (!element.assetId || !element.assetPrompt) {
          throw new Error(`生图资产 ${element.id} 缺少 assetId 或 assetPrompt`)
        }
        if (elementArea(element) >= 0.78) {
          throw new Error(`生图资产 ${element.id} 覆盖范围过大，禁止作为整页回退`)
        }
      } else if (element.classification === 'user_asset') {
        throw new Error(`用户资产 ${element.id} 当前没有接入资产来源；请提供精确品牌源图并使用 source_crop，或改为 imagegen_asset`)
      } else {
        if (!element.sourceExact) {
          throw new Error(`源图裁切 ${element.id} 不是明确的用户原始 Logo/品牌资产`)
        }
        if (elementArea(element) >= 0.78 || sourceArea(element) >= 0.78) {
          throw new Error(`源图裁切 ${element.id} 覆盖范围过大，禁止整页图片回退`)
        }
      }
    }
    elements.push(next)
  }
  if (!elements.some((element) => element.type === 'text' || element.type === 'shape' || element.type === 'rect' || element.type === 'line')) {
    warnings.push('分析结果没有可编辑原生对象')
  }
  return { ...spec, elements, readingOrder: spec.readingOrder.filter((id) => ids.has(id)), warnings: [...new Set(warnings)].slice(0, 40) }
}

export function parsePptxSemanticSpec(text: string, page: Pick<PptxSourcePage, 'width' | 'height'>): PptxSemanticAnalysisResult {
  const rawText = text
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJsonObject(text))
  } catch (error) {
    throw new Error(`语义分析 JSON 无法解析：${error instanceof Error ? error.message : '格式错误'}`)
  }
  const spec = enforceSemanticPolicy(normalizeSlideSpec(parsed, page))
  if (!spec.elements.length) throw new Error('语义分析没有产出可用元素')
  if (!spec.elements.some((element) => element.type !== 'image')) throw new Error('语义分析没有产出可编辑原生对象')
  const nativeElementCount = spec.elements.filter((element) => element.type !== 'image').length
  const sourceAssetCount = spec.elements.filter((element) => element.type === 'image').length
  const lowConfidenceCount = spec.elements.filter((element) => typeof element.confidence === 'number' && element.confidence < 0.7).length
  return { spec, rawText, nativeElementCount, sourceAssetCount, lowConfidenceCount }
}

export async function analyzePptxSlide(options: {
  page: Pick<PptxSourcePage, 'width' | 'height' | 'name'>
  profile: ApiProfile
  imageDataUrl: string
  signal?: AbortSignal
}): Promise<PptxSemanticAnalysisResult> {
  if (options.profile.apiMode !== 'responses') {
    throw new Error('语义重建需要 Responses API 配置，请在 Agent 设置中选择支持 Responses 的配置')
  }
  const text = await callPptxSemanticAnalysisApi({
    profile: options.profile,
    imageDataUrl: options.imageDataUrl,
    instructions: SEMANTIC_ANALYSIS_INSTRUCTIONS,
    signal: options.signal,
  })
  return parsePptxSemanticSpec(text, options.page)
}

export function summarizePptxSemanticSpec(spec: PptxSlideSpec) {
  return {
    nativeElementCount: spec.elements.filter((element) => element.type !== 'image').length,
    sourceAssetCount: spec.elements.filter((element) => element.type === 'image').length,
    textCount: spec.elements.filter((element) => element.type === 'text').length,
    shapeCount: spec.elements.filter((element) => element.type === 'rect' || element.type === 'line' || element.type === 'shape').length,
    lowConfidenceCount: spec.elements.filter((element) => typeof element.confidence === 'number' && element.confidence < 0.7).length,
    warnings: spec.warnings,
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片 Data URL 无效'))
    reader.readAsDataURL(blob)
  })
}

export { SEMANTIC_ANALYSIS_INSTRUCTIONS }


export interface PptxImagegenAssetRequest {
  assetId: string
  prompt: string
  elementIds: string[]
}

/** Return the unique image-generation assets required by a validated SlideSpec. */
export function listPptxImagegenAssets(spec: PptxSlideSpec): PptxImagegenAssetRequest[] {
  const byId = new Map<string, PptxImagegenAssetRequest>()
  for (const element of spec.elements) {
    if (element.type !== 'image' || element.classification !== 'imagegen_asset') continue
    if (!element.assetId || !element.assetPrompt) throw new Error(`生图资产 ${element.id} 缺少 assetId 或 assetPrompt`)
    const existing = byId.get(element.assetId)
    if (existing) {
      if (existing.prompt !== element.assetPrompt) throw new Error(`生图资产 ${element.assetId} 的提示词不一致`)
      existing.elementIds.push(element.id)
    } else {
      byId.set(element.assetId, { assetId: element.assetId, prompt: element.assetPrompt, elementIds: [element.id] })
    }
  }
  return [...byId.values()]
}

/** Keep asset IDs unique across multiple source pages while preserving reuse within one page. */
export function namespacePptxImagegenAssetIds(spec: PptxSlideSpec, namespace: string): PptxSlideSpec {
  const safeNamespace = namespace.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'slide'
  return {
    ...spec,
    elements: spec.elements.map((element) => element.type === 'image' && element.classification === 'imagegen_asset' && element.assetId
      ? { ...element, assetId: `${safeNamespace}-${element.assetId}`.slice(0, 100) }
      : element),
  }
}
