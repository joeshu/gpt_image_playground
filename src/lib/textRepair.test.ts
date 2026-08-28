import { describe, expect, it } from 'vitest'
import type { TextVerificationReport } from '../types'
import { buildTextRepairPrompt, isAutoTextRepairPrompt } from './textRepair'

const report = {
  missingTexts: ['营业员积分明白卡'],
  changedTexts: [{ expected: '工作积分规则', actual: '工作积份规则' }],
  numericChanges: [{ expected: '210.6', actual: '210.8' }],
  regions: [{ type: 'numeric', label: '积分数字', expected: '210.6', actual: '210.8', x: 60, y: 70, width: 20, height: 10 }],
} as TextVerificationReport

describe('targeted OCR repair prompt', () => {
  it('includes exact issues, region hints, protection, and automatic verification marker', () => {
    const prompt = buildTextRepairPrompt('重构版式', report, ['2026年'])

    expect(prompt).toContain('补回缺失文字："营业员积分明白卡"')
    expect(prompt).toContain('将 "工作积份规则" 修正为 "工作积分规则"')
    expect(prompt).toContain('将数字或单位 "210.8" 修正为 "210.6"')
    expect(prompt).toContain('x=60.0%')
    expect(prompt).toContain('[[文字保护清单]]')
    expect(isAutoTextRepairPrompt(prompt)).toBe(true)
  })

  it('replaces a previous repair block instead of duplicating it', () => {
    const first = buildTextRepairPrompt('重构版式', report, [])
    const second = buildTextRepairPrompt(first, { ...report, missingTexts: ['新标题'] }, [])

    expect(second).toContain('补回缺失文字："新标题"')
    expect(second).not.toContain('补回缺失文字："营业员积分明白卡"')
    expect(second.match(/\[\[自动文字修复\]\]/g)).toHaveLength(1)
  })
})
