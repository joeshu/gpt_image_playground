import type { TextVerificationReport } from '../types'
import { buildProtectedTextPrompt } from './protectedText'

const REPAIR_START = '[[自动文字修复]]'
const REPAIR_END = '[[/自动文字修复]]'
const REPAIR_BLOCK_RE = /\n?\[\[自动文字修复\]\][\s\S]*?\[\[\/自动文字修复\]\]\n?/g

function uniqueLines(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function isAutoTextRepairPrompt(prompt: string) {
  return prompt.includes(REPAIR_START) && prompt.includes(REPAIR_END)
}

export function buildTextRepairPrompt(
  prompt: string,
  report: TextVerificationReport,
  protectedTexts: string[],
) {
  const basePrompt = prompt.replace(REPAIR_BLOCK_RE, '\n').trim()
  const issueLines = uniqueLines([
    ...report.missingTexts.map((text) => `补回缺失文字：${JSON.stringify(text)}`),
    ...report.changedTexts.map((item) => `将 ${JSON.stringify(item.actual || '(缺失)')} 修正为 ${JSON.stringify(item.expected)}`),
    ...report.numericChanges.map((item) => `将数字或单位 ${JSON.stringify(item.actual || '(缺失)')} 修正为 ${JSON.stringify(item.expected)}`),
  ])
  const regionHint = (report.regions ?? [])
    .map((region, index) => `区域 ${index + 1}（x=${region.x.toFixed(1)}%, y=${region.y.toFixed(1)}%, w=${region.width.toFixed(1)}%, h=${region.height.toFixed(1)}%）：${region.label || region.type}`)
    .join('\n')

  const repairBlock = [
    REPAIR_START,
    '这是一次文字精确修复任务。以输入图片为唯一视觉基准，只修复下列文字问题。',
    '必须保持原图构图、尺寸、配色、字体气质、Logo、图标、表格、人物和其他非错误区域不变；禁止重新设计整张图片。',
    issueLines.length ? issueLines.map((line, index) => `${index + 1}. ${line}`).join('\n') : '1. 按核验报告修复文字，不改变其他内容。',
    regionHint ? `问题区域参考（结果图百分比坐标）：\n${regionHint}` : '',
    '修复完成后，应用会自动再次执行文字核验。',
    REPAIR_END,
  ].filter(Boolean).join('\n')

  return buildProtectedTextPrompt([basePrompt, repairBlock].filter(Boolean).join('\n\n'), protectedTexts)
}
