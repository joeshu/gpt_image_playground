import { describe, expect, it } from 'vitest'
import type { TextVerificationReport, VisualDifferenceReport } from '../types'
import { getCommercialDeliveryCheck } from './commercialDeliveryCheck'

const textReport: TextVerificationReport = {
  sourceImageId: 'source',
  resultImageId: 'result',
  checkedAt: 1,
  score: 96,
  status: 'passed',
  sourceTexts: [],
  resultTexts: [],
  missingTexts: [],
  changedTexts: [],
  numericChanges: [],
  summary: '文字准确',
}

const visualReport: VisualDifferenceReport = {
  sourceImageId: 'source',
  resultImageId: 'result',
  checkedAt: 1,
  fidelityScore: 91,
  status: 'passed',
  summary: '视觉一致',
  changes: [],
  regions: [],
}

describe('getCommercialDeliveryCheck', () => {
  it('returns pending before any check has completed', () => {
    expect(getCommercialDeliveryCheck()).toMatchObject({
      status: 'pending',
      score: null,
      completedChecks: 0,
    })
  })

  it('does not publish a comprehensive score for a partial check', () => {
    expect(getCommercialDeliveryCheck(textReport)).toMatchObject({
      status: 'partial',
      score: null,
      textScore: 96,
      visualScore: null,
      completedChecks: 1,
    })
  })

  it('weights text accuracy at 60% and visual fidelity at 40%', () => {
    expect(getCommercialDeliveryCheck(textReport, visualReport)).toMatchObject({
      status: 'passed',
      score: 94,
      completedChecks: 2,
    })
  })

  it('collects actionable text and visual issues', () => {
    const result = getCommercialDeliveryCheck(
      {
        ...textReport,
        score: 70,
        status: 'warning',
        missingTexts: ['营业员积分明白卡'],
        numericChanges: [{ expected: '210.6', actual: '210.8' }],
      },
      {
        ...visualReport,
        fidelityScore: 76,
        status: 'warning',
        changes: ['底部说明被裁切'],
        regions: [{
          category: 'crop',
          severity: 'high',
          label: '底部裁切',
          description: '底部奖励说明未完整显示',
          x: 0,
          y: 90,
          width: 100,
          height: 10,
        }],
      },
    )

    expect(result.status).toBe('warning')
    expect(result.score).toBe(72)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'text', severity: 'high', label: '缺失文字：营业员积分明白卡' }),
      expect.objectContaining({ category: 'text', label: '数字变化：210.6 → 210.8' }),
      expect.objectContaining({ category: 'visual', severity: 'high', label: '底部奖励说明未完整显示' }),
      expect.objectContaining({ category: 'visual', label: '底部说明被裁切' }),
    ]))
  })
})
