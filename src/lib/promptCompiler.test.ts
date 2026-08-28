import { describe, expect, it } from 'vitest'
import {
  compilePromptIntent,
  detectPromptTaskType,
  getPromptTaskTypeLabel,
} from './promptCompiler'

describe('prompt compiler', () => {
  it('recognizes a state-owned enterprise reporting PPT', () => {
    const detected = detectPromptTaskType('制作省公司第三季度经营分析工作会汇报 PPT')
    expect(detected.type).toBe('state-owned-ppt')
    expect(detected.confidence).toBeGreaterThan(0.7)
    expect(getPromptTaskTypeLabel(detected.type)).toBe('国企汇报 PPT')
  })

  it('extracts structured intent while preserving references and constraints', () => {
    const intent = compilePromptIntent(
      '基于 @原图 制作一张国企汇报PPT，文字不变，数字不变，16:9 横版',
    )
    expect(intent).toMatchObject({
      taskType: 'state-owned-ppt',
      aspectRatio: '16:9',
      references: ['@原图'],
    })
    expect(intent.immutableRequirements).toEqual(expect.arrayContaining(['文字不变', '数字不变']))
    expect(intent.recommendedConstraints[0]).toContain('16:9')
  })

  it('allows a deliberate manual type override', () => {
    const intent = compilePromptIntent('一张人物照片', 'ppt-report')
    expect(intent.taskType).toBe('ppt-report')
    expect(intent.confidence).toBe(1)
    expect(intent.aspectRatio).toBe('16:9')
  })

  it('falls back to general for ambiguous prompts', () => {
    expect(detectPromptTaskType('一张好看的图片').type).toBe('general')
  })
})
