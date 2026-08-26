import type {
  CreationBatchItem,
  CreationBatchItemStatus,
  CreationBatchJob,
  CreationBatchJobStatus,
  CreationBatchState,
  CreationProject,
  TaskParams,
} from '../types'
import { DEFAULT_PARAMS } from '../types'
import { buildCreationPrompt, normalizeCreationProject } from './creationWorkspace'

export const CREATION_BATCH_STORAGE_KEY = 'gpt-image-playground.creation-batches'
export const MAX_CREATION_BATCH_JOBS = 10
export const MAX_CREATION_BATCH_ITEMS = 999

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const ITEM_STATUSES: CreationBatchItemStatus[] = ['pending', 'running', 'done', 'error', 'cancelled']
const JOB_STATUSES: CreationBatchJobStatus[] = ['draft', 'running', 'paused', 'completed', 'failed', 'cancelled']

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, maxLength).join('')
}

function createId(prefix: string, now: number, suffix = '') {
  return `${prefix}-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}${suffix}`
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeStringArray(value: unknown, maxLength: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean))].slice(0, maxLength)
}

function normalizeParams(value: unknown): TaskParams {
  const source = isRecord(value) ? value : {}
  const quality = source.quality === 'low' || source.quality === 'medium' || source.quality === 'high' ? source.quality : DEFAULT_PARAMS.quality
  const outputFormat = source.output_format === 'jpeg' || source.output_format === 'webp' ? source.output_format : DEFAULT_PARAMS.output_format
  const moderation = source.moderation === 'low' ? 'low' : DEFAULT_PARAMS.moderation
  const outputCompression = typeof source.output_compression === 'number' && Number.isFinite(source.output_compression)
    ? Math.max(0, Math.min(100, Math.round(source.output_compression)))
    : null
  const n = typeof source.n === 'number' && Number.isFinite(source.n) ? Math.max(1, Math.min(10, Math.trunc(source.n))) : DEFAULT_PARAMS.n
  return {
    size: limitText(source.size, 80) || DEFAULT_PARAMS.size,
    quality,
    output_format: outputFormat,
    output_compression: outputCompression,
    moderation,
    n,
    transparent_output: source.transparent_output === true,
  }
}

function normalizeVariableValues(value: unknown) {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => typeof item === 'string')
      .map(([key, item]) => [limitText(key, 80), limitText(item, 300)])
      .filter(([key]) => Boolean(key)),
  )
}

function normalizeItem(value: unknown, index: number, now: number): CreationBatchItem {
  const source = isRecord(value) ? value : {}
  const status = ITEM_STATUSES.includes(source.status as CreationBatchItemStatus)
    ? source.status as CreationBatchItemStatus
    : 'pending'
  const attempts = typeof source.attempts === 'number' && Number.isFinite(source.attempts)
    ? Math.max(0, Math.min(99, Math.trunc(source.attempts)))
    : 0
  return {
    id: limitText(source.id, 100) || `batch-item-${index + 1}`,
    variableValues: normalizeVariableValues(source.variableValues),
    taskId: typeof source.taskId === 'string' && source.taskId.trim() ? source.taskId.trim() : null,
    status,
    attempts,
    error: typeof source.error === 'string' && source.error.trim() ? limitText(source.error, 500) : null,
    createdAt: normalizeTimestamp(source.createdAt, now),
    startedAt: normalizeTimestamp(source.startedAt, 0) || null,
    finishedAt: normalizeTimestamp(source.finishedAt, 0) || null,
  }
}

function normalizeJob(value: unknown, index: number, now: number): CreationBatchJob {
  const source = isRecord(value) ? value : {}
  const project = normalizeCreationProject(source.projectSnapshot, index, now)
  const status = JOB_STATUSES.includes(source.status as CreationBatchJobStatus)
    ? source.status as CreationBatchJobStatus
    : 'draft'
  const sourceItems = Array.isArray(source.items) ? source.items : []
  const items = sourceItems.slice(0, MAX_CREATION_BATCH_ITEMS).map((item, itemIndex) => normalizeItem(item, itemIndex, now))
  return {
    id: limitText(source.id, 100) || `batch-${index + 1}`,
    projectId: limitText(source.projectId, 100) || project.id,
    projectSnapshot: project,
    basePrompt: limitText(source.basePrompt, 20000),
    inputImageIds: normalizeStringArray(source.inputImageIds, 16),
    params: normalizeParams(source.params),
    items,
    status,
    createdAt: normalizeTimestamp(source.createdAt, now),
    updatedAt: normalizeTimestamp(source.updatedAt, now),
  }
}

export function getCreationBatchCombinations(project: CreationProject) {
  const variables = project.series.variables.filter((variable) => variable.values.length > 0)
  if (variables.length === 0) return [{}]

  let combinations: Array<Record<string, string>> = [{}]
  for (const variable of variables) {
    const next: Array<Record<string, string>> = []
    for (const combination of combinations) {
      for (const value of variable.values) {
        next.push({ ...combination, [variable.id]: value })
        if (next.length >= MAX_CREATION_BATCH_ITEMS) break
      }
      if (next.length >= MAX_CREATION_BATCH_ITEMS) break
    }
    combinations = next
    if (combinations.length >= MAX_CREATION_BATCH_ITEMS) break
  }
  return combinations.length > 0 ? combinations.slice(0, MAX_CREATION_BATCH_ITEMS) : [{}]
}

export function createCreationBatchJob(
  project: CreationProject,
  basePrompt: string,
  inputImageIds: string[],
  params: TaskParams,
  now = Date.now(),
): CreationBatchJob {
  const snapshot = normalizeCreationProject(project, 0, now)
  const jobId = createId('batch', now)
  return {
    id: jobId,
    projectId: snapshot.id,
    projectSnapshot: snapshot,
    basePrompt: limitText(basePrompt, 20000),
    inputImageIds: [...new Set(inputImageIds.filter(Boolean))].slice(0, 16),
    params: normalizeParams(params),
    items: getCreationBatchCombinations(snapshot).map((variableValues, index) => ({
      id: `${jobId}-item-${index + 1}`,
      variableValues,
      taskId: null,
      status: 'pending',
      attempts: 0,
      error: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
    })),
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }
}

export function createCreationBatchState(): CreationBatchState {
  return { jobs: [], activeJobId: null }
}

export function normalizeCreationBatchState(value: unknown, now = Date.now()): CreationBatchState {
  if (!isRecord(value)) return createCreationBatchState()
  const sourceJobs = Array.isArray(value.jobs) ? value.jobs : []
  const usedIds = new Set<string>()
  const jobs = sourceJobs.slice(0, MAX_CREATION_BATCH_JOBS).map((item, index) => {
    const job = normalizeJob(item, index, now)
    if (!usedIds.has(job.id)) {
      usedIds.add(job.id)
      return job
    }
    const replacement = { ...job, id: createId('batch', now, `-${index + 1}`) }
    usedIds.add(replacement.id)
    return replacement
  }).map((job) => job.status === 'running' ? { ...job, status: 'paused' as const } : job)

  const requestedActiveId = typeof value.activeJobId === 'string' ? value.activeJobId : null
  return {
    jobs,
    activeJobId: jobs.some((job) => job.id === requestedActiveId) ? requestedActiveId : jobs[0]?.id ?? null,
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

export function loadCreationBatchState(storage: StorageLike | null = getDefaultStorage(), now = Date.now()) {
  if (!storage) return createCreationBatchState()
  try {
    const raw = storage.getItem(CREATION_BATCH_STORAGE_KEY)
    return normalizeCreationBatchState(raw ? JSON.parse(raw) : null, now)
  } catch {
    return createCreationBatchState()
  }
}

export function saveCreationBatchState(state: CreationBatchState, storage: StorageLike | null = getDefaultStorage()) {
  if (!storage) return false
  try {
    storage.setItem(CREATION_BATCH_STORAGE_KEY, JSON.stringify(normalizeCreationBatchState(state)))
    return true
  } catch {
    return false
  }
}

export function getCreationBatchItemPrompt(job: CreationBatchJob, item: CreationBatchItem) {
  return buildCreationPrompt(job.projectSnapshot, job.basePrompt, item.variableValues)
}

export function getCreationBatchProgress(job: CreationBatchJob) {
  const total = job.items.length
  const done = job.items.filter((item) => item.status === 'done').length
  const errors = job.items.filter((item) => item.status === 'error').length
  const pending = job.items.filter((item) => item.status === 'pending').length
  const running = job.items.filter((item) => item.status === 'running').length
  const cancelled = job.items.filter((item) => item.status === 'cancelled').length
  const finished = done + cancelled
  return {
    total,
    done,
    errors,
    pending,
    running,
    cancelled,
    percent: total > 0 ? Math.round((finished / total) * 100) : 0,
  }
}

export function patchCreationBatchItem(job: CreationBatchJob, itemId: string, patch: Partial<CreationBatchItem>, now = Date.now()) {
  return {
    ...job,
    items: job.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    updatedAt: now,
  }
}

export function patchCreationBatchJob(job: CreationBatchJob, patch: Partial<CreationBatchJob>, now = Date.now()) {
  return { ...job, ...patch, updatedAt: now }
}

export function removeCreationBatchJob(state: CreationBatchState, jobId: string): CreationBatchState {
  const jobs = state.jobs.filter((job) => job.id !== jobId)
  return {
    jobs,
    activeJobId: state.activeJobId === jobId ? jobs[0]?.id ?? null : state.activeJobId,
  }
}
