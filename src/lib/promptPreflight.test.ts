import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type TaskParams } from '../types'
import { runPromptPreflight } from './promptPreflight'

const params: TaskParams = { ...DEFAULT_PARAMS, size: '1024x1024' }

describe('runPromptPreflight', () => {
  it('passes a compatible simple request', () => {
    expect(runPromptPreflight({
      prompt: '一只猫的高质量插画',
      inputImageCount: 1,
      params,
      provider: 'openai',
    })).toEqual({ issues: [], passed: true })
  })

  it('warns when requested and selected ratios disagree', () => {
    const result = runPromptPreflight({
      prompt: '制作一张 16:9 横版商业海报',
      inputImageCount: 1,
      params,
      provider: 'openai',
    })
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'ratio', severity: 'warning' }),
    ]))
  })

  it('blocks contradictory text and transparent JPEG settings', () => {
    const result = runPromptPreflight({
      prompt: '中文海报，包含标题，但不要文字，透明背景',
      inputImageCount: 17,
      params: { ...params, output_format: 'jpeg', transparent_output: true },
      provider: 'openai',
    })
    expect(result.passed).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'references', severity: 'error' }),
      expect.objectContaining({ category: 'conflict', severity: 'error' }),
      expect.objectContaining({ category: 'format', severity: 'error' }),
    ]))
  })

  it('warns for dense Chinese copy and provider-specific transparency behavior', () => {
    const result = runPromptPreflight({
      prompt: `中文信息图，海报，${'请完整展示业务规则、标题、说明和数字。'.repeat(20)}`,
      inputImageCount: 9,
      params: { ...params, output_format: 'png', transparent_output: true },
      provider: 'fal',
    })
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: 'text' }),
      expect.objectContaining({ category: 'provider' }),
      expect.objectContaining({ category: 'references' }),
    ]))
  })
})
