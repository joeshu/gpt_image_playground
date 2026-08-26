import type { ApiProvider, TaskParams } from '../types'

export type PreflightIssueSeverity = 'error' | 'warning'

export interface PreflightIssue {
  severity: PreflightIssueSeverity
  category: 'ratio' | 'references' | 'conflict' | 'text' | 'format' | 'provider'
  title: string
  description: string
  suggestion: string
}

export interface PromptPreflightResult {
  issues: PreflightIssue[]
  passed: boolean
}

function hasAny(prompt: string, words: string[]) {
  return words.some((word) => prompt.includes(word))
}

function requestedRatio(prompt: string) {
  if (/(?:竖版|竖屏|长图|人像|手机海报|9[:：]16|4[:：]5)/i.test(prompt)) return 'portrait'
  if (/(?:横版|横屏|宽幅|宽屏|16[:：]9|3[:：]2)/i.test(prompt)) return 'landscape'
  if (/(?:正方形|方图|1[:：]1)/i.test(prompt)) return 'square'
  if (/(?:ppt|幻灯片|演示稿|汇报材料|工作会|经营分析)/i.test(prompt)) return 'landscape'
  return null
}

function selectedRatio(size: string) {
  const match = size.match(/^(\d+)x(\d+)$/)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (width === height) return 'square'
  return width > height ? 'landscape' : 'portrait'
}

export function runPromptPreflight(input: {
  prompt: string
  inputImageCount: number
  params: TaskParams
  provider: ApiProvider
}): PromptPreflightResult {
  const prompt = input.prompt.trim()
  const issues: PreflightIssue[] = []
  const add = (issue: PreflightIssue) => issues.push(issue)

  const wanted = requestedRatio(prompt)
  const selected = selectedRatio(input.params.size)
  if (wanted && selected && wanted !== selected) {
    add({
      severity: 'warning',
      category: 'ratio',
      title: '画面比例可能不匹配',
      description: `提示词要求${wanted === 'portrait' ? '竖版' : wanted === 'landscape' ? '横版' : '正方'}，当前尺寸为${input.params.size}。`,
      suggestion: '调整尺寸或修改提示词中的比例要求。',
    })
  }

  if (input.inputImageCount > 16) {
    add({
      severity: 'error',
      category: 'references',
      title: '参考图数量超过上限',
      description: `当前有 ${input.inputImageCount} 张参考图，接口最多支持 16 张。`,
      suggestion: '删除多余参考图后再提交。',
    })
  } else if (input.inputImageCount > 8) {
    add({
      severity: 'warning',
      category: 'references',
      title: '参考图较多',
      description: `当前有 ${input.inputImageCount} 张参考图，模型可能难以保持重点一致。`,
      suggestion: '保留最关键的参考图，或确认继续。',
    })
  }

  const wantsText = hasAny(prompt, ['文字', '中文', '标题', '标语', '信息图', '海报'])
  const forbidsText = hasAny(prompt, ['不要文字', '无文字', '不含文字', '禁止文字'])
  if (wantsText && forbidsText) {
    add({
      severity: 'error',
      category: 'conflict',
      title: '文字要求互相冲突',
      description: '提示词同时要求生成文字内容，又要求画面不含文字。',
      suggestion: '明确保留文字还是移除文字。',
    })
  }

  const transparentRequested = input.params.transparent_output || hasAny(prompt, ['透明背景', '透明底'])
  if (transparentRequested && input.params.output_format === 'jpeg') {
    add({
      severity: 'error',
      category: 'format',
      title: '透明背景与 JPEG 冲突',
      description: 'JPEG 不支持透明通道，生成后会丢失透明背景。',
      suggestion: '改用 PNG 或 WebP，或关闭透明背景。',
    })
  }

  if (hasAny(prompt, ['写实', '照片级', '真实摄影']) && hasAny(prompt, ['卡通', '动漫', '扁平插画'])) {
    add({
      severity: 'warning',
      category: 'conflict',
      title: '风格要求可能冲突',
      description: '提示词同时包含写实摄影和卡通插画方向。',
      suggestion: '选择一个主风格，并将另一个作为轻量参考。',
    })
  }

  if (hasAny(prompt, ['纯白背景', '白色背景']) && hasAny(prompt, ['黑色背景', '深色背景', '暗色背景'])) {
    add({
      severity: 'warning',
      category: 'conflict',
      title: '背景颜色要求可能冲突',
      description: '提示词同时指定了浅色和深色背景。',
      suggestion: '明确最终背景颜色。',
    })
  }

  const chineseCharCount = (prompt.match(/[\u4e00-\u9fff]/g) ?? []).length
  if (wantsText && chineseCharCount > 120) {
    add({
      severity: 'warning',
      category: 'text',
      title: '中文文字密度较高',
      description: `提示词包含约 ${chineseCharCount} 个中文字符，图像模型可能产生错字或裁切。`,
      suggestion: '将长文拆成模块，并在生成后运行 OCR 文字核验。',
    })
  }

  if (input.provider === 'fal' && input.params.transparent_output) {
    add({
      severity: 'warning',
      category: 'provider',
      title: '当前服务商的透明背景实现不同',
      description: 'fal.ai 可能通过本地处理实现透明背景，边缘效果取决于主体分离质量。',
      suggestion: '生成后检查边缘，并保留原图作为备份。',
    })
  }

  return { issues, passed: issues.length === 0 }
}
