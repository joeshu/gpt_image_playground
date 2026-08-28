import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATE_OWNED_PPT_BRIEF,
  buildStateOwnedPptPrompt,
  getStateOwnedPptBriefCompletion,
  validateStateOwnedPptBrief,
} from './stateOwnedPptBrief'

describe('state-owned PPT brief', () => {
  it('reports completion and validates required context', () => {
    expect(getStateOwnedPptBriefCompletion(DEFAULT_STATE_OWNED_PPT_BRIEF)).toMatchObject({
      filled: 0,
      total: 8,
      percentage: 0,
    })
    expect(validateStateOwnedPptBrief(DEFAULT_STATE_OWNED_PPT_BRIEF)).toEqual([
      '请填写汇报主题',
      '请填写汇报对象',
    ])
  })

  it('builds a strict, factual reporting prompt without inventing blanks', () => {
    const prompt = buildStateOwnedPptPrompt({
      ...DEFAULT_STATE_OWNED_PPT_BRIEF,
      topic: '存量经营提升',
      audience: '省公司领导',
      pageType: 'data',
      data: '收入同比增长 8%',
    }, '保留原图中的红色标题')

    expect(prompt).toContain('任务类型：国企汇报 PPT')
    expect(prompt).toContain('数据/图表：收入同比增长 8%')
    expect(prompt).toContain('原有提示词（保留并融合，不得丢失）')
    expect(prompt).toContain('未填写的字段不得自行推测')
    expect(prompt).not.toContain('背景/现状：')
  })

  it('adds page-specific guidance only when the page needs it', () => {
    const roadmapIssues = validateStateOwnedPptBrief({
      ...DEFAULT_STATE_OWNED_PPT_BRIEF,
      topic: '年度工作安排',
      audience: '经营班子',
      pageType: 'roadmap',
    })
    expect(roadmapIssues).toEqual(['目标举措页建议填写重点举措'])
  })
})
