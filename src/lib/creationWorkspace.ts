import type {
  CreationAspectRatio,
  CreationProject,
  CreationVariable,
  CreationWorkspaceState,
} from '../types'

export const CREATION_WORKSPACE_STORAGE_KEY = 'gpt-image-playground.creation-workspace'
export const MAX_CREATION_PROJECTS = 20
export const MAX_CREATION_VARIABLES = 12
export const CREATION_ASPECT_RATIOS: CreationAspectRatio[] = ['auto', '1:1', '16:9', '9:16', '4:3']

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const DEFAULT_PRIMARY_COLOR = '#2563eb'
const DEFAULT_SECONDARY_COLOR = '#0f172a'
const DEFAULT_NEUTRAL_COLOR = '#f8fafc'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, maxLength).join('')
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback
}

function createId(now: number) {
  return `creation-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeStringArray(value: unknown, maxLength: number) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLength)
}

function normalizeValues(value: unknown) {
  if (Array.isArray(value)) return normalizeStringArray(value, 24)
  if (typeof value !== 'string') return []
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 24)
}

function normalizeVariable(value: unknown, index: number): CreationVariable {
  const source = isRecord(value) ? value : {}
  return {
    id: limitText(source.id, 80) || `variable-${index + 1}`,
    name: limitText(source.name, 60) || `变量${index + 1}`,
    values: normalizeValues(source.values),
  }
}

export function createCreationProject(name = '新创作项目', now = Date.now()): CreationProject {
  return {
    id: createId(now),
    name: limitText(name, 80) || '新创作项目',
    description: '',
    brand: {
      name: '',
      slogan: '',
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      neutralColor: DEFAULT_NEUTRAL_COLOR,
      visualNotes: '',
      referenceImageIds: [],
    },
    style: {
      enabled: true,
      visualDirection: '',
      keywords: '',
      avoid: '',
      layoutRules: '',
    },
    series: {
      name: '',
      subject: '',
      consistencyRules: '',
      aspectRatio: 'auto',
      variables: [],
    },
    createdAt: now,
    updatedAt: now,
  }
}

export function normalizeCreationProject(value: unknown, index = 0, now = Date.now()): CreationProject {
  const source = isRecord(value) ? value : {}
  const brand = isRecord(source.brand) ? source.brand : {}
  const style = isRecord(source.style) ? source.style : {}
  const series = isRecord(source.series) ? source.series : {}
  const fallback = createCreationProject(`新创作项目${index + 1}`, now)
  const aspectRatio = CREATION_ASPECT_RATIOS.includes(series.aspectRatio as CreationAspectRatio)
    ? series.aspectRatio as CreationAspectRatio
    : fallback.series.aspectRatio

  return {
    id: limitText(source.id, 80) || fallback.id,
    name: limitText(source.name, 80) || fallback.name,
    description: limitText(source.description, 300),
    brand: {
      name: limitText(brand.name, 80),
      slogan: limitText(brand.slogan, 160),
      primaryColor: normalizeColor(brand.primaryColor, DEFAULT_PRIMARY_COLOR),
      secondaryColor: normalizeColor(brand.secondaryColor, DEFAULT_SECONDARY_COLOR),
      neutralColor: normalizeColor(brand.neutralColor, DEFAULT_NEUTRAL_COLOR),
      visualNotes: limitText(brand.visualNotes, 1200),
      referenceImageIds: normalizeStringArray(brand.referenceImageIds, 16),
    },
    style: {
      enabled: style.enabled !== false,
      visualDirection: limitText(style.visualDirection, 800),
      keywords: limitText(style.keywords, 500),
      avoid: limitText(style.avoid, 500),
      layoutRules: limitText(style.layoutRules, 800),
    },
    series: {
      name: limitText(series.name, 80),
      subject: limitText(series.subject, 800),
      consistencyRules: limitText(series.consistencyRules, 1200),
      aspectRatio,
      variables: Array.isArray(series.variables)
        ? series.variables.slice(0, MAX_CREATION_VARIABLES).map((item, itemIndex) => normalizeVariable(item, itemIndex))
        : [],
    },
    createdAt: normalizeTimestamp(source.createdAt, now),
    updatedAt: normalizeTimestamp(source.updatedAt, now),
  }
}

export function createCreationWorkspace(now = Date.now()): CreationWorkspaceState {
  const project = createCreationProject('新创作项目', now)
  return { projects: [project], activeProjectId: project.id }
}

export function normalizeCreationWorkspace(value: unknown, now = Date.now()): CreationWorkspaceState {
  if (!isRecord(value)) return createCreationWorkspace(now)

  const sourceProjects = Array.isArray(value.projects) ? value.projects : []
  const usedIds = new Set<string>()
  const projects = sourceProjects.slice(0, MAX_CREATION_PROJECTS).map((item, index) => {
    const project = normalizeCreationProject(item, index, now)
    if (!usedIds.has(project.id)) {
      usedIds.add(project.id)
      return project
    }
    const replacement = { ...project, id: createId(now + index + 1) }
    usedIds.add(replacement.id)
    return replacement
  })

  if (projects.length === 0) return createCreationWorkspace(now)

  const requestedActiveId = typeof value.activeProjectId === 'string' ? value.activeProjectId : ''
  return {
    projects,
    activeProjectId: projects.some((project) => project.id === requestedActiveId)
      ? requestedActiveId
      : projects[0].id,
  }
}

function getDefaultStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadCreationWorkspace(storage: StorageLike | null = getDefaultStorage(), now = Date.now()) {
  if (!storage) return createCreationWorkspace(now)

  try {
    const raw = storage.getItem(CREATION_WORKSPACE_STORAGE_KEY)
    return normalizeCreationWorkspace(raw ? JSON.parse(raw) : null, now)
  } catch {
    return createCreationWorkspace(now)
  }
}

export function saveCreationWorkspace(state: CreationWorkspaceState, storage: StorageLike | null = getDefaultStorage()) {
  if (!storage) return false

  try {
    storage.setItem(CREATION_WORKSPACE_STORAGE_KEY, JSON.stringify(normalizeCreationWorkspace(state)))
    return true
  } catch {
    return false
  }
}

export function getActiveCreationProject(state: CreationWorkspaceState) {
  return state.projects.find((project) => project.id === state.activeProjectId) ?? state.projects[0] ?? null
}

export function getCreationProjectCompletion(project: CreationProject) {
  const checks = [
    project.name,
    project.description,
    project.brand.name,
    project.brand.visualNotes,
    project.style.visualDirection,
    project.series.name,
    project.series.subject,
    project.series.consistencyRules,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

export function getCreationBatchCombinationCount(project: CreationProject) {
  const counts = project.series.variables.map((variable) => variable.values.length).filter((count) => count > 0)
  if (counts.length === 0) return 1
  return Math.min(999, counts.reduce((total, count) => total * count, 1))
}

export function removeCreationProject(state: CreationWorkspaceState, projectId: string): CreationWorkspaceState {
  if (state.projects.length <= 1) return state
  const projects = state.projects.filter((project) => project.id !== projectId)
  if (projects.length === state.projects.length) return state
  return {
    projects,
    activeProjectId: state.activeProjectId === projectId ? projects[0].id : state.activeProjectId,
  }
}

export function buildCreationPrompt(project: CreationProject, currentPrompt = '') {
  const lines = ['【创作工作台规则】', `项目：${project.name}`]
  if (project.description) lines.push(`项目说明：${project.description}`)

  const brandLines = [
    project.brand.name && `品牌名称：${project.brand.name}`,
    project.brand.slogan && `品牌口号：${project.brand.slogan}`,
    `品牌主色：${project.brand.primaryColor}`,
    `品牌辅助色：${project.brand.secondaryColor}`,
    `中性色：${project.brand.neutralColor}`,
    project.brand.visualNotes && `品牌视觉资产说明：${project.brand.visualNotes}`,
    project.brand.referenceImageIds.length > 0 && `已绑定品牌参考图：${project.brand.referenceImageIds.length} 张（应用前请保持这些参考图仍在输入栏中）`,
  ].filter((line): line is string => Boolean(line))
  if (brandLines.length > 0) lines.push('品牌资产：', ...brandLines)

  if (project.style.enabled) {
    const styleLines = [
      project.style.visualDirection && `视觉方向：${project.style.visualDirection}`,
      project.style.keywords && `风格关键词：${project.style.keywords}`,
      project.style.layoutRules && `版式规则：${project.style.layoutRules}`,
      project.style.avoid && `避免：${project.style.avoid}`,
    ].filter((line): line is string => Boolean(line))
    if (styleLines.length > 0) lines.push('风格锁定（必须保持）：', ...styleLines)
  }

  const seriesLines = [
    project.series.name && `系列名称：${project.series.name}`,
    project.series.subject && `系列主体：${project.series.subject}`,
    project.series.aspectRatio !== 'auto' && `系列比例：${project.series.aspectRatio}`,
    project.series.consistencyRules && `跨图一致性：${project.series.consistencyRules}`,
  ].filter((line): line is string => Boolean(line))
  if (seriesLines.length > 0) lines.push('系列一致性：', ...seriesLines)

  const variableLines = project.series.variables
    .filter((variable) => variable.name || variable.values.length > 0)
    .map((variable) => `- ${variable.name}：${variable.values.join('、') || '待填写'}`)
  if (variableLines.length > 0) lines.push('批量变量（仅使用已填写值）：', ...variableLines)

  lines.push('执行约束：不得虚构或修改用户提供的业务事实、中文原文、数字、单位和政治表述；如信息缺失，保留待补位置。')
  const base = currentPrompt.trim()
  return base ? `${base}\n\n${lines.join('\n')}` : lines.join('\n')
}
