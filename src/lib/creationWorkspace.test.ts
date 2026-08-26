import { describe, expect, it } from 'vitest'
import {
  buildCreationPrompt,
  createCreationProject,
  exportCreationProject,
  getCreationBatchCombinationCount,
  getCreationProjectCompletion,
  loadCreationWorkspace,
  normalizeCreationWorkspace,
  parseCreationProjectExport,
  removeCreationProject,
  saveCreationWorkspace,
} from './creationWorkspace'

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('creation workspace', () => {
  it('creates a usable local workspace with one active project', () => {
    const workspace = loadCreationWorkspace(null, 100)

    expect(workspace.projects).toHaveLength(1)
    expect(workspace.activeProjectId).toBe(workspace.projects[0].id)
    expect(workspace.projects[0].createdAt).toBe(100)
  })

  it('normalizes invalid persisted fields without losing the project shell', () => {
    const workspace = normalizeCreationWorkspace({
      activeProjectId: 'missing',
      projects: [{
        id: 'p1',
        name: '  项目  ',
        brand: { primaryColor: 'red', referenceImageIds: ['image-a', 1] },
        style: { enabled: false },
        series: { aspectRatio: '21:9', variables: [{ name: '场景', values: '会议，展厅' }] },
      }],
    }, 200)

    expect(workspace.activeProjectId).toBe('p1')
    expect(workspace.projects[0].name).toBe('项目')
    expect(workspace.projects[0].brand.primaryColor).toBe('#2563eb')
    expect(workspace.projects[0].brand.referenceImageIds).toEqual(['image-a'])
    expect(workspace.projects[0].style.enabled).toBe(false)
    expect(workspace.projects[0].series.aspectRatio).toBe('auto')
    expect(workspace.projects[0].series.variables[0].values).toEqual(['会议', '展厅'])
  })

  it('round-trips the workspace through the local storage adapter', () => {
    const storage = createMemoryStorage()
    const project = createCreationProject('品牌项目', 300)
    const workspace = { projects: [project], activeProjectId: project.id }

    expect(saveCreationWorkspace(workspace, storage)).toBe(true)
    expect(loadCreationWorkspace(storage, 301)).toEqual(workspace)
  })

  it('calculates batch combinations and caps runaway combinations', () => {
    const project = createCreationProject()
    project.series.variables = [
      { id: 'a', name: '主题', values: ['A', 'B'] },
      { id: 'b', name: '场景', values: ['1', '2', '3'] },
    ]

    expect(getCreationBatchCombinationCount(project)).toBe(6)
    project.series.variables = Array.from({ length: 12 }, (_, index) => ({
      id: String(index),
      name: String(index),
      values: Array.from({ length: 24 }, String),
    }))
    expect(getCreationBatchCombinationCount(project)).toBe(999)
  })

  it('builds a factual prompt block and preserves the current prompt', () => {
    const project = createCreationProject('国企汇报项目')
    project.description = '季度经营分析'
    project.brand.name = '中国联通'
    project.brand.referenceImageIds = ['image-a']
    project.style.visualDirection = '正式克制、清晰留白'
    project.series.aspectRatio = '16:9'
    project.series.variables = [{ id: 'page', name: '页型', values: ['形势分析', '目标举措'] }]

    const prompt = buildCreationPrompt(project, '保留原始数字 100%')

    expect(prompt.startsWith('保留原始数字 100%\n\n【创作工作台规则】')).toBe(true)
    expect(prompt).toContain('品牌名称：中国联通')
    expect(prompt).toContain('已绑定品牌参考图：1 张')
    expect(prompt).toContain('系列比例：16:9')
    expect(prompt).toContain('不得虚构或修改用户提供的业务事实')
  })

  it('reports completion and prevents deleting the last project', () => {
    const project = createCreationProject()
    expect(getCreationProjectCompletion(project)).toBe(13)

    const workspace = { projects: [project], activeProjectId: project.id }
    expect(removeCreationProject(workspace, project.id)).toBe(workspace)
  })

  it('exports and restores a normalized project configuration', () => {
    const project = createCreationProject('可复现项目', 400)
    project.brand.name = '中国联通'
    project.series.aspectRatio = '16:9'

    const restored = parseCreationProjectExport(exportCreationProject(project, 401), 500)

    expect(restored?.name).toBe('可复现项目')
    expect(restored?.brand.name).toBe('中国联通')
    expect(restored?.series.aspectRatio).toBe('16:9')
    expect(restored?.updatedAt).toBe(400)
  })
})
