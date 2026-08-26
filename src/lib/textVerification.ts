import type { ApiProfile, TextVerificationChange, TextVerificationReport } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'

interface RawVerificationReport {
  score?: unknown
  source_texts?: unknown
  result_texts?: unknown
  missing_texts?: unknown
  changed_texts?: unknown
  numeric_changes?: unknown
  summary?: unknown
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
}

function changeList(value: unknown): TextVerificationChange[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const expected = typeof record.expected === 'string' ? record.expected.trim() : ''
    const actual = typeof record.actual === 'string' ? record.actual.trim() : ''
    return expected || actual ? [{ expected, actual }] : []
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

export function parseTextVerificationResponse(
  responseText: string,
  sourceImageId: string,
  resultImageId: string,
  checkedAt = Date.now(),
): TextVerificationReport {
  const jsonText = responseText
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/, '')
  let raw: RawVerificationReport
  try {
    raw = JSON.parse(jsonText) as RawVerificationReport
  } catch {
    throw new Error('文字核验返回格式无效，请重试')
  }

  const scoreValue = typeof raw.score === 'number' && Number.isFinite(raw.score) ? raw.score : 0
  const score = Math.min(100, Math.max(0, Math.round(scoreValue)))
  const missingTexts = stringList(raw.missing_texts)
  const changedTexts = changeList(raw.changed_texts)
  const numericChanges = changeList(raw.numeric_changes)
  const hasDifferences = missingTexts.length > 0 || changedTexts.length > 0 || numericChanges.length > 0

  return {
    sourceImageId,
    resultImageId,
    checkedAt,
    score,
    status: hasDifferences || score < 90 ? 'warning' : 'passed',
    sourceTexts: stringList(raw.source_texts),
    resultTexts: stringList(raw.result_texts),
    missingTexts,
    changedTexts,
    numericChanges,
    summary: typeof raw.summary === 'string' ? raw.summary.trim() : '',
  }
}

export async function verifyImageText(opts: {
  profile: ApiProfile
  sourceImageId: string
  sourceDataUrl: string
  resultImageId: string
  resultDataUrl: string
  prompt: string
  signal?: AbortSignal
}): Promise<TextVerificationReport> {
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
          '你是中文商业图片文字核验器。',
          '第一张图是来源基准，第二张图是生成结果。',
          '逐字识别两张图中可见的中文、英文、数字、单位和标点，并核对结果图是否忠实。',
          '不要把纯版式变化判为文字错误；数字、金额、比例、年份和小数必须严格核对。',
          '仅输出一个 JSON 对象，不要 Markdown。',
          '字段必须为 score(0-100)、source_texts(string[])、result_texts(string[])、missing_texts(string[])、changed_texts({expected,actual}[])、numeric_changes({expected,actual}[])、summary(string)。',
        ].join('\n'),
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: `任务提示词（仅作辅助，图片文字为核验依据）：\n${prompt || '(无)'}\n\n下面依次是来源基准图与生成结果图。` },
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
        mode: '文字核验 Responses API',
      }))
    }

    const payload = await response.json() as unknown
    const responseText = extractResponseText(payload)
    if (!responseText) throw new Error('文字核验未返回分析结果')
    return parseTextVerificationResponse(responseText, sourceImageId, resultImageId)
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
