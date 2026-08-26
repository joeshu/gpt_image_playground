import { describe, expect, it } from 'vitest'
import { parseTextVerificationResponse } from './textVerification'

describe('text verification response', () => {
  it('parses fenced JSON and keeps text and numeric differences separate', () => {
    const report = parseTextVerificationResponse(`\`\`\`json
{
  "score": 76.4,
  "source_texts": ["2026年", "积分 210.6"],
  "result_texts": ["2028年", "积分 210.8"],
  "missing_texts": ["营业员积分明白卡"],
  "changed_texts": [{"expected": "工作积分规则", "actual": "工作积份规则"}],
  "numeric_changes": [{"expected": "210.6", "actual": "210.8"}],
  "summary": "存在文字与数字变化"
}
\`\`\``, 'source', 'result', 123)

    expect(report).toMatchObject({
      sourceImageId: 'source',
      resultImageId: 'result',
      checkedAt: 123,
      score: 76,
      status: 'warning',
      missingTexts: ['营业员积分明白卡'],
      changedTexts: [{ expected: '工作积分规则', actual: '工作积份规则' }],
      numericChanges: [{ expected: '210.6', actual: '210.8' }],
    })
  })

  it('passes a high-scoring result without reported differences', () => {
    const report = parseTextVerificationResponse(JSON.stringify({
      score: 98,
      source_texts: ['标题'],
      result_texts: ['标题'],
      missing_texts: [],
      changed_texts: [],
      numeric_changes: [],
      summary: '文字一致',
    }), 'source', 'result')

    expect(report.status).toBe('passed')
    expect(report.score).toBe(98)
  })

  it('rejects non-JSON output', () => {
    expect(() => parseTextVerificationResponse('无法核验', 'source', 'result'))
      .toThrow('文字核验返回格式无效')
  })
})
