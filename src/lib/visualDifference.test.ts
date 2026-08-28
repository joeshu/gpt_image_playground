import { describe, expect, it } from 'vitest'
import { parseVisualDifferenceResponse } from './visualDifference'

describe('visual difference response', () => {
  it('normalizes severity regions and clips percentage bounds', () => {
    const report = parseVisualDifferenceResponse(
      '```json\n' + JSON.stringify({
        fidelity_score: 81.6,
        summary: '布局与主色存在变化',
        changes: ['顶部标题区域下移', '品牌红偏橙'],
        regions: [
          { category: 'layout', severity: 'high', label: '标题位移', description: '标题下移', bbox: [10, 20, 40, 12] },
          { category: 'color', severity: 'medium', label: '主色变化', description: '红色偏橙', bbox: [0.8, 0.9, 0.4, 0.3] },
        ],
      }) + '\n```',
      'source',
      'result',
      123,
    )

    expect(report).toMatchObject({
      sourceImageId: 'source',
      resultImageId: 'result',
      checkedAt: 123,
      fidelityScore: 82,
      status: 'warning',
      changes: ['顶部标题区域下移', '品牌红偏橙'],
      regions: [
        { category: 'layout', severity: 'high', x: 10, y: 20, width: 40, height: 12 },
        { category: 'color', severity: 'medium', x: 80, y: 90, width: 20, height: 10 },
      ],
    })
  })

  it('passes a high-fidelity result without important differences', () => {
    const report = parseVisualDifferenceResponse(JSON.stringify({
      fidelity_score: 96,
      summary: '视觉结构一致',
      changes: [],
      regions: [{ category: 'style', severity: 'low', label: '细微质感', description: '', bbox: [1, 1, 5, 5] }],
    }), 'source', 'result')

    expect(report.status).toBe('passed')
  })

  it('rejects malformed output and invalid regions', () => {
    expect(() => parseVisualDifferenceResponse('not json', 'source', 'result'))
      .toThrow('视觉差异检测返回格式无效')

    const report = parseVisualDifferenceResponse(JSON.stringify({
      fidelity_score: 90,
      changes: [],
      regions: [{ category: 'unknown', severity: 'high', bbox: [0, 0, 10, 10] }],
    }), 'source', 'result')
    expect(report.regions).toEqual([])
  })
})
