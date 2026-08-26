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
      'ppt-report',
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

  it('includes a dedicated state-owned enterprise reporting PPT template', () => {
    const template = BUILTIN_PROMPT_TEMPLATES.find((item) => item.id === 'state-owned-report-ppt')!
    const rendered = renderPromptTemplate(template, {
      ...getPromptTemplateDefaults(template),
      topic: '经营分析',
      audience: '省公司领导',
      conclusion: '重点业务保持增长',
      sections: '现状、问题、举措',
      brandColor: '中国联通红',
    })
    expect(rendered).toContain('国企汇报 PPT')
    expect(rendered).toContain('不虚构数据')
    expect(rendered).toContain('省公司领导')
  })

  it('uses empty values instead of silently inventing business facts', () => {
    const template = BUILTIN_PROMPT_TEMPLATES.find((item) => item.id === 'infographic-business')!
    const rendered = renderPromptTemplate(template, getPromptTemplateDefaults(template))
    expect(rendered).toContain('{{topic}}')
    expect(rendered).toContain('不擅自增删或改写核心内容')
  })
})
