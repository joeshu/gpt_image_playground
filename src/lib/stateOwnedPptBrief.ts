export type StateOwnedPptPageType = 'cover' | 'summary' | 'analysis' | 'roadmap' | 'data' | 'closing'

export interface StateOwnedPptBrief {
  topic: string
  audience: string
  background: string
  problems: string
  goals: string
  initiatives: string
  data: string
  conclusion: string
  pageType: StateOwnedPptPageType
  aspectRatio: '16:9' | '4:3'
  brandColor: string
}

export const DEFAULT_STATE_OWNED_PPT_BRIEF: StateOwnedPptBrief = {
  topic: '',
  audience: '',
  background: '',
  problems: '',
  goals: '',
  initiatives: '',
  data: '',
  conclusion: '',
  pageType: 'summary',
  aspectRatio: '16:9',
  brandColor: '稳重的企业品牌色',
}

export const STATE_OWNED_PPT_PAGE_TYPES: Array<{ value: StateOwnedPptPageType; label: string; description: string }> = [
  { value: 'cover', label: '封面页', description: '主题、汇报单位和时间' },
  { value: 'summary', label: '工作总结', description: '结论、进展和关键成果' },
  { value: 'analysis', label: '形势分析', description: '现状、问题和原因' },
  { value: 'roadmap', label: '目标举措', description: '目标、路径和重点动作' },
  { value: 'data', label: '数据分析', description: '指标、趋势和对比图表' },
  { value: 'closing', label: '结论请求', description: '结论、请求和下一步安排' },
]

const FIELD_LABELS: Array<[keyof StateOwnedPptBrief, string]> = [
  ['topic', '汇报主题'],
  ['audience', '汇报对象'],
  ['background', '背景/现状'],
  ['problems', '核心问题'],
  ['goals', '目标/指标'],
  ['initiatives', '重点举措'],
  ['data', '数据/图表'],
  ['conclusion', '结论/请求'],
]

export function getStateOwnedPptBriefCompletion(brief: StateOwnedPptBrief) {
  const filled = FIELD_LABELS.filter(([key]) => Boolean(brief[key].trim())).length
  return { filled, total: FIELD_LABELS.length, percentage: Math.round((filled / FIELD_LABELS.length) * 100) }
}

export function validateStateOwnedPptBrief(brief: StateOwnedPptBrief) {
  const issues: string[] = []
  if (!brief.topic.trim()) issues.push('请填写汇报主题')
  if (!brief.audience.trim()) issues.push('请填写汇报对象')
  if (brief.pageType === 'data' && !brief.data.trim()) issues.push('数据分析页建议填写数据/图表')
  if (brief.pageType === 'roadmap' && !brief.initiatives.trim()) issues.push('目标举措页建议填写重点举措')
  return issues
}

export function buildStateOwnedPptPrompt(brief: StateOwnedPptBrief, existingPrompt = '') {
  const lines = [
    '任务类型：国企汇报 PPT',
    `页面类型：${STATE_OWNED_PPT_PAGE_TYPES.find((item) => item.value === brief.pageType)?.label ?? '工作总结'}`,
    `画面比例：${brief.aspectRatio} 横版`,
    `品牌色方向：${brief.brandColor.trim() || DEFAULT_STATE_OWNED_PPT_BRIEF.brandColor}`,
    ...FIELD_LABELS
      .filter(([key]) => brief[key].trim())
      .map(([key, label]) => `${label}：${brief[key].trim()}`),
    '执行约束：采用正式、克制、可信的政企商务风格；突出结论和关键数字；建立标题、结论、数据、举措、备注层级；保证投屏和手机预览可读；不虚构业务事实，不改变政治表述，不产生乱码、水印或文字裁切。',
    '未填写的字段不得自行推测；原始业务文字、数字、单位和计算关系必须保持不变。',
  ]
  const original = existingPrompt.trim()
  if (original) lines.push(`原有提示词（保留并融合，不得丢失）：${original}`)
  return lines.join('\n')
}
