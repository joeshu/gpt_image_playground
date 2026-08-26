import { describe, expect, it } from 'vitest'
import { parsePromptEnhancementResponse } from './promptEnhancer'

describe('parsePromptEnhancementResponse', () => {
  it('parses structured prompt enhancement output', () => {
    const result = parsePromptEnhancementResponse(JSON.stringify({
      enhanced_prompt: '联通红商业信息图，16:9 横版',
      summary: '强化信息层级',
      task_type: 'infographic',
      reference_notes: '沿用红白主色、三栏层级与底部数据卡片留白',
      sections: {
        subject: '积分明白卡',
        composition: '三栏布局',
        constraints: '文字与数字不可修改',
      },
    }), '优化积分明白卡')

    expect(result.originalPrompt).toBe('优化积分明白卡')
    expect(result.enhancedPrompt).toContain('16:9')
    expect(result.taskType).toBe('infographic')
    expect(result.referenceNotes).toContain('红白主色')
    expect(result.sections.subject).toBe('积分明白卡')
    expect(result.sections.lighting).toBe('')
  })

  it('accepts fenced JSON responses', () => {
    const result = parsePromptEnhancementResponse(
      `\`\`\`json
{"enhanced_prompt":"高端商品图","summary":"","sections":{}}
\`\`\``,
      '商品图',
    )
    expect(result.enhancedPrompt).toBe('高端商品图')
    expect(result.referenceNotes).toBe('')
  })

  it('rejects invalid or empty enhanced prompts', () => {
    expect(() => parsePromptEnhancementResponse('not-json', '原文')).toThrow('返回格式无效')
    expect(() => parsePromptEnhancementResponse('{"enhanced_prompt":""}', '原文')).toThrow('未返回可用内容')
  })
})
