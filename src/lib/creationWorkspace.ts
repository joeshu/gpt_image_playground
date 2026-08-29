import type {
  CreationAspectRatio,
  CreationLockLayer,
  CreationProject,
  CreationVariable,
  CreationWorkspaceState,
} from '../types'

export const CREATION_WORKSPACE_STORAGE_KEY = 'gpt-image-playground.creation-workspace'
export const MAX_CREATION_PROJECTS = 20
export const MAX_CREATION_VARIABLES = 12
export const CREATION_ASPECT_RATIOS: CreationAspectRatio[] = ['auto', '1:1', '16:9', '9:16', '4:3']
export const CREATION_LOCK_LAYERS: Array<{ value: CreationLockLayer; label: string; description: string }> = [
  { value: 'facts', label: '事实', description: '数字、口径和已确认信息' },
  { value: 'text', label: '文案', description: '标题、产品名和业务原文' },
  { value: 'ratio', label: '比例', description: '输出尺寸与画面比例' },
  { value: 'composition', label: '构图', description: '版式、留白和安全区' },
  { value: 'style', label: '风格', description: '视觉方向、关键词和禁用项' },
]
export const DEFAULT_CREATION_LOCK_LAYERS: CreationLockLayer[] = CREATION_LOCK_LAYERS.map((layer) => layer.value)

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

export function normalizeCreationBrandColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback
}

function normalizeColor(value: unknown, fallback: string) {
  return normalizeCreationBrandColor(value, fallback)
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

function normalizeLockLayers(value: unknown) {
  if (!Array.isArray(value)) return [...DEFAULT_CREATION_LOCK_LAYERS]
  return [...new Set(value.filter((item): item is CreationLockLayer => CREATION_LOCK_LAYERS.some((layer) => layer.value === item)))]
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

const CREATION_VARIABLE_TOKEN_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g

export function getCreationPromptVariableTokens(prompt: string) {
  const tokens: string[] = []
  for (const match of prompt.matchAll(CREATION_VARIABLE_TOKEN_PATTERN)) {
    const token = match[1]?.trim()
    if (token && !tokens.includes(token)) tokens.push(token)
  }
  return tokens
}

function getCreationVariableLookup(project: CreationProject) {
  const lookup = new Map<string, CreationVariable>()
  const duplicateKeys = new Set<string>()
  for (const variable of project.series.variables) {
    for (const key of [variable.id, variable.name.trim()]) {
      if (!key) continue
      if (lookup.has(key)) duplicateKeys.add(key)
      else lookup.set(key, variable)
    }
  }
  return { lookup, duplicateKeys }
}

export function getCreationPromptVariableWarnings(project: CreationProject, prompt: string) {
  const tokens = getCreationPromptVariableTokens(prompt)
  if (tokens.length === 0) return []
  const { lookup, duplicateKeys } = getCreationVariableLookup(project)
  const warnings: string[] = []
  const duplicateTokens = tokens.filter((token) => duplicateKeys.has(token))
  const unknownTokens = tokens.filter((token) => !lookup.has(token))
  const emptyTokens = tokens
    .map((token) => lookup.get(token))
    .filter((variable): variable is CreationVariable => variable != null && variable.values.length === 0)
    .map((variable) => variable.name)
    .filter((name, index, names) => names.indexOf(name) === index)

  if (duplicateTokens.length > 0) warnings.push(`变量名称重复：${duplicateTokens.join('、')}`)
  if (unknownTokens.length > 0) warnings.push(`未定义变量：${unknownTokens.join('、')}`)
  if (emptyTokens.length > 0) warnings.push(`变量尚未填写值：${emptyTokens.join('、')}`)
  return warnings
}

export function expandCreationPromptVariables(prompt: string, project: CreationProject, selectedVariableValues?: Record<string, string>) {
  if (!selectedVariableValues) return prompt
  const { lookup } = getCreationVariableLookup(project)
  return prompt.replace(CREATION_VARIABLE_TOKEN_PATTERN, (match, rawToken: string) => {
    const variable = lookup.get(rawToken.trim())
    if (!variable || !Object.prototype.hasOwnProperty.call(selectedVariableValues, variable.id)) return match
    return selectedVariableValues[variable.id] ?? match
  })
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
      fixedFacts: '',
      mandatoryText: '',
      forbiddenChanges: '',
      logoUsage: '',
      referenceImageIds: [],
    },
    style: {
      enabled: true,
      visualDirection: '',
      keywords: '',
      avoid: '',
      layoutRules: '',
      lockedLayers: [...DEFAULT_CREATION_LOCK_LAYERS],
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
      fixedFacts: limitText(brand.fixedFacts, 3000),
      mandatoryText: limitText(brand.mandatoryText, 6000),
      forbiddenChanges: limitText(brand.forbiddenChanges, 3000),
      logoUsage: limitText(brand.logoUsage, 1200),
      referenceImageIds: normalizeStringArray(brand.referenceImageIds, 16),
    },
    style: {
      enabled: style.enabled !== false,
      visualDirection: limitText(style.visualDirection, 800),
      keywords: limitText(style.keywords, 500),
      avoid: limitText(style.avoid, 500),
      layoutRules: limitText(style.layoutRules, 800),
      lockedLayers: normalizeLockLayers(style.lockedLayers),
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

export function getCreationLockSummary(project: CreationProject) {
  const locked = new Set(project.style.lockedLayers)
  const ready = new Set<CreationLockLayer>()
  if (project.brand.fixedFacts.trim()) ready.add('facts')
  if (project.brand.mandatoryText.trim()) ready.add('text')
  if (project.series.aspectRatio !== 'auto') ready.add('ratio')
  if (project.style.layoutRules.trim()) ready.add('composition')
  if (project.style.visualDirection.trim() || project.style.keywords.trim() || project.style.avoid.trim()) ready.add('style')
  const lockedItems = CREATION_LOCK_LAYERS.filter((layer) => locked.has(layer.value))
  return {
    lockedCount: lockedItems.length,
    readyCount: lockedItems.filter((layer) => ready.has(layer.value)).length,
    total: CREATION_LOCK_LAYERS.length,
    labels: lockedItems.map((layer) => layer.label),
    warnings: getCreationLockWarnings(project),
  }
}

export function getCreationLockWarnings(project: CreationProject) {
  if (!project.style.enabled) return []
  const locked = new Set(project.style.lockedLayers)
  const warnings: string[] = []
  if (locked.has('facts') && !project.brand.fixedFacts.trim()) warnings.push('事实锁尚未填写固定事实或数字')
  if (locked.has('text') && !project.brand.mandatoryText.trim()) warnings.push('文案锁尚未填写必须保留的原文')
  if (locked.has('ratio') && project.series.aspectRatio === 'auto') warnings.push('比例锁尚未指定默认比例')
  if (locked.has('composition') && !project.style.layoutRules.trim()) warnings.push('构图锁尚未填写版式规则')
  if (locked.has('style') && !project.style.visualDirection.trim() && !project.style.keywords.trim() && !project.style.avoid.trim()) warnings.push('风格锁尚未填写视觉方向或风格关键词')
  return warnings
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

export function exportCreationProject(project: CreationProject, exportedAt = Date.now()) {
  return JSON.stringify({
    kind: 'gpt-image-playground.creation-project',
    version: 2,
    exportedAt,
    project: normalizeCreationProject(project, 0, exportedAt),
  }, null, 2)
}

export function parseCreationProjectExport(raw: string, now = Date.now()) {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const project = isRecord(parsed.project) ? parsed.project : parsed
    return normalizeCreationProject(project, 0, now)
  } catch {
    return null
  }
}

export function buildCreationPrompt(project: CreationProject, currentPrompt = '', selectedVariableValues?: Record<string, string>) {
  const lines = ['【创作工作台规则】', `项目：${project.name}`]
  if (project.description) lines.push(`项目说明：${project.description}`)
  const lockedLayers = new Set(project.style.lockedLayers)

  const brandLines = [
    project.brand.name && `品牌名称：${project.brand.name}`,
    project.brand.slogan && `品牌口号：${project.brand.slogan}`,
    `品牌主色：${project.brand.primaryColor}`,
    `品牌辅助色：${project.brand.secondaryColor}`,
    `中性色：${project.brand.neutralColor}`,
    project.brand.visualNotes && `品牌视觉资产说明：${project.brand.visualNotes}`,
    project.brand.logoUsage && `Logo/品牌资产使用规则：${project.brand.logoUsage}`,
    lockedLayers.has('facts') && project.brand.fixedFacts && `固定事实与数字（不得改写）：${project.brand.fixedFacts}`,
    lockedLayers.has('text') && project.brand.mandatoryText && `必须保留的原文（逐字）：${project.brand.mandatoryText}`,
    project.brand.forbiddenChanges && `品牌禁改项：${project.brand.forbiddenChanges}`,
    project.brand.referenceImageIds.length > 0 && `已绑定品牌参考图：${project.brand.referenceImageIds.length} 张（应用前请保持这些参考图仍在输入栏中）`,
  ].filter((line): line is string => Boolean(line))
  if (brandLines.length > 0) lines.push('品牌资产：', ...brandLines)

  if (project.style.enabled) {
    const styleLines = [
      lockedLayers.has('style') && project.style.visualDirection && `视觉方向：${project.style.visualDirection}`,
      lockedLayers.has('style') && project.style.keywords && `风格关键词：${project.style.keywords}`,
      lockedLayers.has('composition') && project.style.layoutRules && `版式规则：${project.style.layoutRules}`,
      lockedLayers.has('style') && project.style.avoid && `避免：${project.style.avoid}`,
    ].filter((line): line is string => Boolean(line))
    if (styleLines.length > 0) lines.push('风格锁定（必须保持）：', ...styleLines)
    if (lockedLayers.size > 0) lines.push(`锁定层：${CREATION_LOCK_LAYERS.filter((layer) => lockedLayers.has(layer.value)).map((layer) => layer.label).join('、')}`)
  }

  const seriesLines = [
    project.series.name && `系列名称：${project.series.name}`,
    project.series.subject && `系列主体：${project.series.subject}`,
    lockedLayers.has('ratio') && project.series.aspectRatio !== 'auto' && `系列比例：${project.series.aspectRatio}`,
    project.series.consistencyRules && `跨图一致性：${project.series.consistencyRules}`,
  ].filter((line): line is string => Boolean(line))
  if (seriesLines.length > 0) lines.push('系列一致性：', ...seriesLines)

  const hasSelectedVariables = selectedVariableValues != null
  const variableLines = project.series.variables
    .filter((variable) => variable.name || variable.values.length > 0)
    .map((variable) => {
      const hasSelectedValue = hasSelectedVariables && Object.prototype.hasOwnProperty.call(selectedVariableValues, variable.id)
      const value = hasSelectedValue ? selectedVariableValues[variable.id] : variable.values.join('、')
      return `- ${variable.name}：${value || '待填写'}`
    })
  if (variableLines.length > 0) lines.push(hasSelectedVariables ? '本次批量变量组合：' : '批量变量（仅使用已填写值）：', ...variableLines)

  lines.push('执行约束：不得虚构或修改用户提供的业务事实、中文原文、数字、单位和政治表述；如信息缺失，保留待补位置。')
  const base = expandCreationPromptVariables(currentPrompt.trim(), project, selectedVariableValues)
  return base ? `${base}\n\n${lines.join('\n')}` : lines.join('\n')
}
