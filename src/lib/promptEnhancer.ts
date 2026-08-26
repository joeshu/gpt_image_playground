import type { ApiProfile, InputImage } from '../types'
import { compilePromptIntent, getPromptTaskTypeLabel, type PromptTaskType } from './promptCompiler'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'

export type PromptEnhancementLevel = 'faithful' | 'balanced' | 'professional'

export const PROMPT_ENHANCER_MAX_REFERENCE_IMAGES = 4

export interface PromptEnhancementResult {
  originalPrompt: string
  enhancedPrompt: string
  summary: string
  taskType: PromptTaskType
  /** 参考图的视觉结构分析；不应替代用户业务事实。 */
  referenceNotes: string
  sections: {
    subject: string
    scene: string
    composition: string
    lighting: string
    material: string
    color: string
    constraints: string
  }
}

const EMPTY_SECTIONS: PromptEnhancementResult['sections'] = {
  subject: '',
  scene: '',
  composition: '',
  lighting: '',
  material: '',
  color: '',
  constraints: '',
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

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function parsePromptEnhancementResponse(responseText: string, originalPrompt: string, taskType?: PromptTaskType): PromptEnhancementResult {
  const jsonText = responseText.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '')
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(jsonText) as Record<string, unknown>
  } catch {
    throw new Error('提示词增强返回格式无效，请重试')
  }

  const enhancedPrompt = stringValue(raw.enhanced_prompt)
  if (!enhancedPrompt) throw new Error('提示词增强未返回可用内容')
  const rawSections = raw.sections && typeof raw.sections === 'object'
    ? raw.sections as Record<string, unknown>
    : {}

  return {
    originalPrompt,
    enhancedPrompt,
    summary: stringValue(raw.summary),
    referenceNotes: stringValue(raw.reference_notes),
    taskType: ['poster', 'ecommerce', 'portrait', 'logo', 'infographic', 'ppt-report', 'state-owned-ppt', 'general'].includes(String(raw.task_type))
      ? raw.task_type as PromptTaskType
      : taskType ?? compilePromptIntent(originalPrompt).taskType,
    sections: Object.fromEntries(
      Object.keys(EMPTY_SECTIONS).map((key) => [key, stringValue(rawSections[key])]),
    ) as PromptEnhancementResult['sections'],
  }
}

export async function enhancePrompt(opts: {
  profile: ApiProfile
  prompt: string
  level: PromptEnhancementLevel
  taskType?: PromptTaskType
  /** 当前输入框附带的参考图；仅在用户点击增强时发送给视觉文本模型。 */
  referenceImages?: InputImage[]
  /**
   * 与 referenceImages 一一对应的可追踪标签，例如 @图1、@第1轮图2。
   * 仅用于让视觉模型知道原始提示词中的引用对应哪张图。
   */
  referenceImageLabels?: string[]
  signal?: AbortSignal
}): Promise<PromptEnhancementResult> {
  const { profile, prompt, level, taskType: requestedTaskType, referenceImages: requestedReferenceImages, referenceImageLabels, signal } = opts
  const intent = compilePromptIntent(prompt, requestedTaskType)
  const taskType = intent.taskType
  const referenceImageEntries = (requestedReferenceImages ?? [])
    .map((image, index) => ({
      image,
      label: referenceImageLabels?.[index]?.trim() || `参考图 ${index + 1}`,
    }))
    .filter(({ image }) => Boolean(image?.dataUrl))
    .slice(0, PROMPT_ENHANCER_MAX_REFERENCE_IMAGES)
  const referenceImages = referenceImageEntries.map(({ image }) => image)
  const proxyConfig = readClientDevProxyConfig()
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  const endpoint = buildApiUrl(profile.baseUrl, 'responses', proxyConfig, useApiProxy)
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(new DOMException('请求超时', 'TimeoutError')), profile.timeout * 1000)
  const abortFromCaller = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abortFromCaller, { once: true })

  const referenceGuidance = referenceImages.length > 0
    ? [
        `本次提供了 ${referenceImages.length} 张参考图。只分析版式、色彩、视觉风格、留白、层级和安全区，不改写用户业务事实、原文、数字或专有名词。`,
        taskType === 'state-owned-ppt'
          ? '针对国企汇报 PPT，重点识别标题、结论、数据、表格、页脚层级与安全区；只提取视觉规则，不臆测政策或经营数据。'
          : '',
      ]
    : ['本次没有提供参考图；reference_notes 返回空字符串。']

  const levelInstruction = {
    faithful: '忠实原意：只补齐必要的画面信息，不改变主题、事实、文字、数字或核心风格。',
    balanced: '适度优化：在忠实原意基础上增强构图、光线、材质、色彩与商业可读性。',
    professional: '专业重写：整理为可直接交付专业图像模型的结构化提示词，强化设计语言与约束，但不得虚构业务事实。',
  }[level]

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
          '你是专业图像生成提示词编辑器。',
          `当前任务类型：${getPromptTaskTypeLabel(taskType)}。`,
          taskType === 'state-owned-ppt'
            ? '针对国企汇报 PPT：采用 16:9 横版、正式克制的政企商务风格，突出结论、数据、举措和备注层级；不虚构数据，不改变政治表述。'
            : '',
          ...referenceGuidance,
          levelInstruction,
          '保留所有 @ 引用标记、专有名词、中文原文、数字、单位、比例和不可修改要求。',
          '不要执行图像生成，不要回答用户任务，只优化提示词。',
          '仅输出 JSON，不要 Markdown。',
          '格式：{\"task_type\":\"任务类型值\",\"enhanced_prompt\":\"完整增强提示词\",\"summary\":\"本次增强摘要\",\"reference_notes\":\"参考图视觉结构分析；无参考图时为空字符串\",\"sections\":{\"subject\":\"\",\"scene\":\"\",\"composition\":\"\",\"lighting\":\"\",\"material\":\"\",\"color\":\"\",\"constraints\":\"\"}}',
          '未涉及的结构字段可以为空字符串。',
        ].join('\n'),
        input: [{
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `原始提示词：\n${prompt}\n\n请在 reference_notes 中仅总结参考图的视觉结构规则。`,
            },
            ...referenceImageEntries.flatMap(({ image, label }, index) => [
              { type: 'input_text', text: `参考图 ${index + 1}（${label}）：` },
              { type: 'input_image', image_url: image.dataUrl },
            ]),
          ],
        }],
      }),
    })

    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, { endpoint, mode: '提示词增强 Responses API' }))
    }
    const payload = await response.json() as unknown
    const responseText = extractResponseText(payload)
    if (!responseText) throw new Error('提示词增强未返回内容')
    return parsePromptEnhancementResponse(responseText, prompt, taskType)
  } finally {
    window.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abortFromCaller)
  }
}
