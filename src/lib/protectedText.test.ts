import { describe, expect, it } from 'vitest'
import type { TextVerificationReport } from '../types'
import { buildProtectedTextPrompt, getProtectableTexts, normalizeProtectedTexts } from './protectedText'

describe('protected text constraints', () => {
  it('normalizes empty and duplicate values without changing order', () => {
    expect(normalizeProtectedTexts([' 标题 ', '', '2026年', '标题'])).toEqual(['标题', '2026年'])
  })

  it('collects source and issue text as lock candidates', () => {
    const report = {
      sourceTexts: ['主标题', '积分 210.6'],
      missingTexts: ['营业员积分明白卡'],
      changedTexts: [{ expected: '工作规则', actual: '工作规责' }],
      numericChanges: [{ expected: '210.6', actual: '210.8' }],
    } as TextVerificationReport

    expect(getProtectableTexts(report)).toEqual([
      '主标题',
      '积分 210.6',
      '营业员积分明白卡',
      '工作规则',
      '210.6',
    ])
  })

  it('replaces an existing protection block instead of duplicating it', () => {
    const first = buildProtectedTextPrompt('重构版式', ['标题', '0.95'])
    const second = buildProtectedTextPrompt(first, ['新标题'])

    expect(second).toContain('重构版式')
    expect(second).toContain('1. "新标题"')
    expect(second).not.toContain('"标题"')
    expect(second.match(/\[\[文字保护清单\]\]/g)).toHaveLength(1)
  })

  it('returns the clean prompt when the lock list is empty', () => {
    expect(buildProtectedTextPrompt('重构版式', [])).toBe('重构版式')
  })
})
