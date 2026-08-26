import type { TextVerificationReport } from '../types'

const PROTECTION_START = '[[文字保护清单]]'
const PROTECTION_END = '[[/文字保护清单]]'
const PROTECTION_BLOCK_RE = /\n?\[\[文字保护清单\]\][\s\S]*?\[\[\/文字保护清单\]\]\n?/g

export function normalizeProtectedTexts(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const text = value.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    result.push(text)
  }
  return result
}

export function getProtectableTexts(report: TextVerificationReport) {
  return normalizeProtectedTexts([
    ...report.sourceTexts,
    ...report.missingTexts,
    ...report.changedTexts.map((item) => item.expected),
    ...report.numericChanges.map((item) => item.expected),
  ])
}

export function buildProtectedTextPrompt(prompt: string, protectedTexts: string[]) {
  const basePrompt = prompt.replace(PROTECTION_BLOCK_RE, '\n').trim()
  const texts = normalizeProtectedTexts(protectedTexts)
  if (texts.length === 0) return basePrompt

  const list = texts.map((text, index) => `${index + 1}. ${JSON.stringify(text)}`).join('\n')
  return [
    basePrompt,
    '',
    PROTECTION_START,
    '以下内容为不可修改文字。后续编辑、重绘和版式调整时必须逐字保留，包括数字、单位、大小写和标点；不得改写、增删或用近似字符替换：',
    list,
    PROTECTION_END,
  ].filter(Boolean).join('\n')
}
