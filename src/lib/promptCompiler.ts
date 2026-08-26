export type PromptTaskType =
  | 'poster'
  | 'ecommerce'
  | 'portrait'
  | 'logo'
  | 'infographic'
  | 'ppt-report'
  | 'state-owned-ppt'
  | 'general'

export interface PromptTaskTypeOption {
  value: PromptTaskType
  label: string
  description: string
}

export const PROMPT_TASK_TYPE_OPTIONS: PromptTaskTypeOption[] = [
  { value: 'state-owned-ppt', label: '国企汇报 PPT', description: '党委、经营分析、工作会和专题汇报' },
  { value: 'ppt-report', label: '汇报 PPT', description: '演示稿、汇报材料和工作汇报' },
  { value: 'infographic', label: '中文信息图', description: '规则说明、数据看板和信息长图' },
  { value: 'poster', label: '商业海报', description: '活动、营销和运营宣传' },
  { value: 'ecommerce', label: '电商商品图', description: '商品主图和详情页素材' },
  { value: 'portrait', label: '人物肖像', description: '人物海报、头像和品牌故事' },
  { value: 'logo', label: 'Logo 方向稿', description: '品牌标志和视觉方向探索' },
  { value: 'general', label: '通用图像', description: '其他图像生成或编辑任务' },
]

const TYPE_KEYWORDS: Array<{ type: PromptTaskType; words: string[]; score: number }> = [
  {
    type: 'state-owned-ppt',
    words: ['国企', '央企', '党委', '党群', '党建', '工作会', '经营分析', '年度总结', '季度汇报', '省公司', '市公司', '区县公司', '领导汇报'],
    score: 4,
  },
  {
    type: 'ppt-report',
    words: ['ppt', 'PPT', '幻灯片', '演示稿', '汇报材料', '工作汇报', '汇报页', '汇报图'],
    score: 3,
  },
  { type: 'infographic', words: ['信息图', '数据看板', '规则说明', '流程图', '明白卡'], score: 3 },
  { type: 'ecommerce', words: ['商品主图', '电商', '详情页', '产品图', '商品摄影'], score: 3 },
  { type: 'portrait', words: ['人物肖像', '头像', '人像', '人物海报'], score: 3 },
  { type: 'logo', words: ['logo', 'Logo', '标志', '品牌字标'], score: 3 },
  { type: 'poster', words: ['海报', '宣传页', '营销物料', '活动主视觉'], score: 2 },
]

export interface PromptIntent {
  taskType: PromptTaskType
  confidence: number
  aspectRatio: string | null
  references: string[]
  chineseCharacterCount: number
  immutableRequirements: string[]
  recommendedConstraints: string[]
}

function taskTypeLabel(type: PromptTaskType) {
  return PROMPT_TASK_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? '通用图像'
}

export function getPromptTaskTypeLabel(type: PromptTaskType) {
  return taskTypeLabel(type)
}

export function detectPromptTaskType(prompt: string): { type: PromptTaskType; confidence: number } {
  const normalized = prompt.trim()
  if (!normalized) return { type: 'general', confidence: 0 }

  const matches = TYPE_KEYWORDS
    .map((entry) => ({
      ...entry,
      hits: entry.words.filter((word) => normalized.includes(word)).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => (b.hits * b.score) - (a.hits * a.score))

  const best = matches[0]
  if (!best) return { type: 'general', confidence: 0.25 }

  const confidence = Math.min(0.99, 0.55 + best.hits * 0.1 + (best.type === 'state-owned-ppt' ? 0.12 : 0))
  return { type: best.type, confidence: Number(confidence.toFixed(2)) }
}

function detectAspectRatio(prompt: string, taskType: PromptTaskType) {
  const match = prompt.match(/\b(\d+\s*[:：]\s*\d+)\b/)
  if (match) return match[1].replace(/\s/g, '').replace('：', ':')
  if (/(横版|横屏|宽幅|16[:：]9)/i.test(prompt)) return '16:9'
  if (/(竖版|竖屏|长图|9[:：]16|4[:：]5)/i.test(prompt)) return '9:16'
  if (/(正方形|方图|1[:：]1)/i.test(prompt)) return '1:1'
  if (taskType === 'state-owned-ppt' || taskType === 'ppt-report') return '16:9'
  return null
}

function extractReferences(prompt: string) {
  return Array.from(prompt.matchAll(/@[^\s，。；;！？!?,，]+/g), (match) => match[0])
}

function extractImmutableRequirements(prompt: string) {
  return Array.from(prompt.matchAll(/[^。；\n]{0,30}(?:不可修改|不能修改|必须保留|原文保留|数字不变|文字不变)[^。；\n]{0,50}/g), (match) => match[0].trim())
}

export function compilePromptIntent(prompt: string, overrideType?: PromptTaskType): PromptIntent {
  const detected = detectPromptTaskType(prompt)
  const taskType = overrideType ?? detected.type
  const recommendedConstraints: string[] = [
    '保留用户明确的事实、数字、单位和专有名词',
    '输出前检查文字准确性、裁切和安全边距',
  ]

  if (taskType === 'state-owned-ppt') {
    recommendedConstraints.unshift(
      '采用 16:9 横版国企汇报风格，正式、克制、清晰，避免娱乐化装饰',
      '建立标题、结论、数据、举措和备注的汇报层级，不虚构业务数据',
      '优先使用稳重的红、蓝、深灰或品牌色，确保投屏与打印可读',
    )
  } else if (taskType === 'ppt-report') {
    recommendedConstraints.unshift(
      '采用 16:9 横版演示稿结构，突出结论和信息层级',
      '控制每页信息密度，保证标题、图表和关键数字在投屏上可读',
    )
  } else if (taskType === 'infographic') {
    recommendedConstraints.unshift('使用网格、分区和对齐线组织信息，重点数字视觉突出')
  }

  return {
    taskType,
    confidence: overrideType ? 1 : detected.confidence,
    aspectRatio: detectAspectRatio(prompt, taskType),
    references: extractReferences(prompt),
    chineseCharacterCount: (prompt.match(/[\u4e00-\u9fff]/g) ?? []).length,
    immutableRequirements: extractImmutableRequirements(prompt),
    recommendedConstraints,
  }
}
