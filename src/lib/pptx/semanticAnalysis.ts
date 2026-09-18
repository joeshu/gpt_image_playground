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

Coordinates for every element and every sourceBox are normalized to 0..1 relative to the complete source image. Preserve the source reading order and approximate geometry. Paint background panels and masking patches before the text or icon that sits above them.

Allowed editable native elements:
1. text: {id,type:"text",box,text,style:{fontFamily,fontSizePt,color,bold,italic,align,verticalAnchor,marginPt},confidence,editable:true}
2. rect: {id,type:"rect",box,fill,line,radius,confidence}
3. line: {id,type:"line",box,line,widthPt,headEnd,tailEnd,confidence}
4. shape: {id,type:"shape",shape,box,fill,line,widthPt,rotation,confidence}; shape is one of rect, roundRect, ellipse, chevron, rightArrow, leftArrow, upArrow, downArrow, hexagon, diamond.

Use native text for all readable titles, labels, numbers and body copy. Use native rectangles/rounded rectangles for cards, headers, pills, separators and flat-color masks. Reconstruct simple charts with native lines, ellipses and text labels; do not use a screenshot of the whole chart. Use native arrows or chevrons for visible process arrows.

Allowed non-native fallback:
5. image: {id,type:"image",box,sourceBox,classification:"source_crop",confidence,editable:false,fallbackReason}. Use this only for a small complex logo, icon, illustration, photo, gradient decoration or other asset that cannot be represented reliably by native objects. sourceBox MUST be a tight crop of the same source image and must not cover the whole page. Never return a full-page source image and never put a source crop behind text that has already been reconstructed. If an icon is ambiguous, preserve it as a small source crop rather than inventing its meaning.

Important quality rules:
- Do not omit readable Chinese text merely because it is small.
- Do not duplicate a text region as both image and text.
- Do not use image crops for large cards, chart areas or page backgrounds.
- For text removed from the raster source, add an appropriately colored flat rect or small local background patch underneath when necessary to prevent ghosting.
- Split mixed-color title fragments into separate text elements when needed.
- For line charts, estimate data points and use one line element per segment plus small ellipse points and editable labels.
- Report confidence from 0 to 1 for every text and image; do not claim confidence for pixels you cannot read.
- Keep the result under 220 elements. Prefer faithful, editable structure over decorative over-segmentation.
- If a complex region cannot be reconstructed, use a tight source crop and add a warning. Do not silently fake it.
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
      if (element.classification !== 'source_crop' && !element.assetId) {
        next = {
          ...element,
          classification: 'source_crop',
          sourceBox: element.sourceBox ?? element.box,
          editable: false,
          fallbackReason: element.fallbackReason || '未提供独立资产，回退为源图局部资产',
        }
        warnings.push(`资产 ${element.id} 未提供 assetId，已回退为源图局部资产`)
      }
      const image = next as Extract<PptxSlideElement, { type: 'image' }>
      if (image.classification === 'source_crop' && (elementArea(image) >= 0.78 || sourceArea(image) >= 0.78)) {
        warnings.push(`移除疑似整页图片回退：${image.id}`)
        continue
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
