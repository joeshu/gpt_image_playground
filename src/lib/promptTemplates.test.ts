import { describe, expect, it } from 'vitest'
import {
  BUILTIN_PROMPT_TEMPLATES,
  getPromptTemplateDefaults,
  renderPromptTemplate,
} from './promptTemplates'

describe('prompt templates', () => {
  it('ships the core professional template categories', () => {
    expect(BUILTIN_PROMPT_TEMPLATES.map((template) => template.category)).toEqual([
      'poster',
      'ecommerce',
      'portrait',
      'logo',
      'infographic',
    ])
  })

  it('renders variables and keeps unknown placeholders visible', () => {
    const template = BUILTIN_PROMPT_TEMPLATES[0]
    const values = { ...getPromptTemplateDefaults(template), topic: '积分明白卡' }
    const rendered = renderPromptTemplate(template, values)
    expect(rendered).toContain('积分明白卡')
    expect(rendered).toContain('16:9')
    expect(rendered).not.toContain('{{topic}}')
  })

  it('uses empty values instead of silently inventing business facts', () => {
    const template = BUILTIN_PROMPT_TEMPLATES.find((item) => item.id === 'infographic-business')!
    const rendered = renderPromptTemplate(template, getPromptTemplateDefaults(template))
    expect(rendered).toContain('{{topic}}')
    expect(rendered).toContain('不擅自增删或改写核心内容')
  })
})
