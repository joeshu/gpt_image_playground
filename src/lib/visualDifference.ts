import type { ApiProfile, VisualDifferenceRegion, VisualDifferenceReport } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'

interface RawVisualDifferenceReport {
  fidelity_score?: unknown
  summary?: unknown
  changes?: unknown
  regions?: unknown
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function regionList(value: unknown): VisualDifferenceRegion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const category = ['layout', 'color', 'element', 'crop', 'style'].includes(String(record.category))
      ? record.category as VisualDifferenceRegion['category']
      : null
    const severity = ['low', 'medium', 'high'].includes(String(record.severity))
      ? record.severity as VisualDifferenceRegion['severity']
      : null
    const bbox = Array.isArray(record.bbox) ? record.bbox : []
    if (!category || !severity || bbox.length !== 4 || !bbox.every((part) => typeof part === 'number' && Number.isFinite(part))) return []

    const rawBox = bbox as number[]
    const multiplier = rawBox.every((part) => part >= 0 && part <= 1) ? 100 : 1
    const x = clampPercent(rawBox[0] * multiplier)
    const y = clampPercent(rawBox[1] * multiplier)
    const width = Math.min(100 - x, Math.max(1, rawBox[2] * multiplier))
    const height = Math.min(100 - y, Math.max(1, rawBox[3] * multiplier))
    if (width <= 0 || height <= 0) return []

    return [{
      category,
      severity,
      label: typeof record.label === 'string' ? record.label.trim() : '',
      description: typeof record.description === 'string' ? record.description.trim() : '',
      x,
      y,
      width,
      height,
    }]
  })
}

function extractResponseText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ''

  const chunks: string[] = []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text = (part as { text?: unknown }).text
      if (typeof text === 'string') chunks.push(text)
    }
  }
  return chunks.join('\n').trim()
}

export function parseVisualDifferenceResponse(
  responseText: string,
  sourceImageId: string,
  resultImageId: string,
  checkedAt = Date.now(),
): VisualDifferenceReport {
  const jsonText = responseText
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')

  let raw: RawVisualDifferenceReport
  try {
    raw = JSON.parse(jsonText) as RawVisualDifferenceReport
  } catch {
    throw new Error('视觉差异检测返回格式无效，请重试')
  }

  const scoreValue = typeof raw.fidelity_score === 'number' && Number.isFinite(raw.fidelity_score)
    ? raw.fidelity_score
    : 0
  const fidelityScore = Math.min(100, Math.max(0, Math.round(scoreValue)))
  const regions = regionList(raw.regions)
  const changes = stringList(raw.changes)
  const hasImportantDifference = regions.some((region) => region.severity !== 'low') || changes.length > 0

  return {
    sourceImageId,
    resultImageId,
    checkedAt,
    fidelityScore,
    status: fidelityScore >= 90 && !hasImportantDifference ? 'passed' : 'warning',
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
    changes,
    regions,
  }
}

export async function analyzeVisualDifference(opts: {
  profile: ApiProfile
  sourceImageId: string
  sourceDataUrl: string
  resultImageId: string
  resultDataUrl: string
  prompt: string
  signal?: AbortSignal
}): Promise<VisualDifferenceReport> {
  const { profile, sourceImageId, sourceDataUrl, resultImageId, resultDataUrl, prompt, signal } = opts
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  const endpoint = buildApiUrl(profile.baseUrl, 'responses', proxyConfig, useApiProxy)
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), profile.timeout * 1000)
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        model: profile.model,
        instructions: [
          '你是商业设计视觉差异审计器。第一张图是来源基准，第二张图是生成结果。',
          '根据用户任务意图区分合理重构和非预期变化；重点检查布局层级、关键元素、Logo/图标/表格、裁切、安全区、主色与整体风格。',
          '文字内容准确性由独立 OCR 流程负责，不要重复报告纯文字错字。',
          '仅报告对忠实重构或商业交付有意义的差异，不要把轻微抗锯齿、压缩噪声或像素级色差列为问题。',
          '仅输出一个 JSON 对象，不要 Markdown。',
          '字段必须为 fidelity_score(0-100)、summary(string)、changes(string[])、regions。',
          'regions 每项为 {category,severity,label,description,bbox}；category 仅 layout/color/element/crop/style，severity 仅 low/medium/high。',
          'bbox 是结果图上的 [x,y,width,height]，使用 0-100 百分比坐标；只框选可合理定位的区域，不要重复。',
        ].join('\n'),
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: `任务意图：\n${prompt || '(无)'}\n\n下面依次是来源基准图与生成结果图。` },
            { type: 'input_text', text: '来源基准图：' },
            { type: 'input_image', image_url: sourceDataUrl },
            { type: 'input_text', text: '生成结果图：' },
            { type: 'input_image', image_url: resultDataUrl },
          ],
        }],
      }),
    })

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, {
        endpoint,
        mode: '视觉差异 Responses API',
      }))
    }

    const payload = await response.json() as unknown
    const responseText = extractResponseText(payload)
    if (!responseText) throw new Error('视觉差异检测未返回分析结果')
    return parseVisualDifferenceResponse(responseText, sourceImageId, resultImageId)
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
