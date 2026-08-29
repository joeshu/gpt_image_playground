import type {
  ApiMode,
  ApiProvider,
  AppMode,
  CreationProject,
  CreationReplaySnapshot,
  CreationReplayState,
  TaskParams,
} from '../types'
import { DEFAULT_PARAMS } from '../types'
import { normalizeCreationProject } from './creationWorkspace'

export const CREATION_REPLAY_STORAGE_KEY = 'gpt-image-playground.creation-replays'
export const CREATION_REPLAY_CHANGED_EVENT = 'creation-replays-changed'
export const MAX_CREATION_REPLAY_SNAPSHOTS = 20

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export interface CreationReplayCapture {
  label?: string
  project: CreationProject
  prompt: string
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  params: TaskParams
  sourceMode: AppMode
  apiProfileId?: string | null
  apiProfileName?: string | null
  apiProvider?: ApiProvider | null
  apiMode?: ApiMode | null
  apiModel?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function limitText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return Array.from(value.trim()).slice(0, maxLength).join('')
}

function createId(now: number) {
  return `replay-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeTimestamp(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeStringId(value: unknown) {
  const id = limitText(value, 160)
  return id || null
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
  const quality = source.quality === 'low' || source.quality === 'medium' || source.quality === 'high'
    ? source.quality
    : DEFAULT_PARAMS.quality
  const outputFormat = source.output_format === 'jpeg' || source.output_format === 'webp'
    ? source.output_format
    : DEFAULT_PARAMS.output_format
  const moderation = source.moderation === 'low' ? 'low' : DEFAULT_PARAMS.moderation
  const outputCompression = typeof source.output_compression === 'number' && Number.isFinite(source.output_compression)
    ? Math.max(0, Math.min(100, Math.round(source.output_compression)))
    : null
  const n = typeof source.n === 'number' && Number.isFinite(source.n)
    ? Math.max(1, Math.min(10, Math.trunc(source.n)))
    : DEFAULT_PARAMS.n
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

function normalizeApiMode(value: unknown): ApiMode | null {
  return value === 'images' || value === 'responses' ? value : null
}

function normalizeSourceMode(value: unknown): AppMode {
  return value === 'agent' ? 'agent' : 'gallery'
}

export function normalizeCreationReplaySnapshot(value: unknown, index = 0, now = Date.now()): CreationReplaySnapshot {
  const source = isRecord(value) ? value : {}
  const project = normalizeCreationProject(source.projectSnapshot, index, now)
  return {
    id: limitText(source.id, 100) || `replay-${index + 1}`,
    label: limitText(source.label, 100) || project.name || `创作快照 ${index + 1}`,
    projectId: limitText(source.projectId, 100) || project.id,
    projectSnapshot: project,
    prompt: limitText(source.prompt, 20000),
    inputImageIds: normalizeStringArray(source.inputImageIds, 16),
    maskTargetImageId: normalizeStringId(source.maskTargetImageId),
    maskImageId: normalizeStringId(source.maskImageId),
    params: normalizeParams(source.params),
    sourceMode: normalizeSourceMode(source.sourceMode),
    apiProfileId: normalizeStringId(source.apiProfileId),
    apiProfileName: normalizeStringId(source.apiProfileName),
    apiProvider: normalizeStringId(source.apiProvider),
    apiMode: normalizeApiMode(source.apiMode),
    apiModel: normalizeStringId(source.apiModel),
    createdAt: normalizeTimestamp(source.createdAt, now),
  }
}

export function createCreationReplaySnapshot(capture: CreationReplayCapture, now = Date.now()): CreationReplaySnapshot {
  const project = normalizeCreationProject(capture.project, 0, now)
  return normalizeCreationReplaySnapshot({
    id: createId(now),
    label: capture.label || project.name,
    projectId: project.id,
    projectSnapshot: project,
    prompt: capture.prompt,
    inputImageIds: capture.inputImageIds,
    maskTargetImageId: capture.maskTargetImageId ?? null,
    maskImageId: capture.maskImageId ?? null,
    params: capture.params,
    sourceMode: capture.sourceMode,
    apiProfileId: capture.apiProfileId ?? null,
    apiProfileName: capture.apiProfileName ?? null,
    apiProvider: capture.apiProvider ?? null,
    apiMode: capture.apiMode ?? null,
    apiModel: capture.apiModel ?? null,
    createdAt: now,
  }, 0, now)
}

export function createCreationReplayState(): CreationReplayState {
  return { snapshots: [], activeSnapshotId: null }
}

export function normalizeCreationReplayState(value: unknown, now = Date.now()): CreationReplayState {
  if (!isRecord(value)) return createCreationReplayState()
  const sourceSnapshots = Array.isArray(value.snapshots) ? value.snapshots : []
  const usedIds = new Set<string>()
  const snapshots = sourceSnapshots.slice(0, MAX_CREATION_REPLAY_SNAPSHOTS).map((item, index) => {
    const snapshot = normalizeCreationReplaySnapshot(item, index, now)
    if (!usedIds.has(snapshot.id)) {
      usedIds.add(snapshot.id)
      return snapshot
    }
    const replacement = { ...snapshot, id: createId(now + index + 1) }
    usedIds.add(replacement.id)
    return replacement
  })
  const requestedActiveId = typeof value.activeSnapshotId === 'string' ? value.activeSnapshotId : null
  return {
    snapshots,
    activeSnapshotId: snapshots.some((snapshot) => snapshot.id === requestedActiveId)
      ? requestedActiveId
      : snapshots[0]?.id ?? null,
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

export function loadCreationReplayState(storage: StorageLike | null = getDefaultStorage(), now = Date.now()) {
  if (!storage) return createCreationReplayState()
  try {
    const raw = storage.getItem(CREATION_REPLAY_STORAGE_KEY)
    return normalizeCreationReplayState(raw ? JSON.parse(raw) : null, now)
  } catch {
    return createCreationReplayState()
  }
}

export function saveCreationReplayState(state: CreationReplayState, storage: StorageLike | null = getDefaultStorage()) {
  if (!storage) return false
  try {
    const normalized = normalizeCreationReplayState(state)
    storage.setItem(CREATION_REPLAY_STORAGE_KEY, JSON.stringify(normalized))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CREATION_REPLAY_CHANGED_EVENT, { detail: normalized }))
    }
    return true
  } catch {
    return false
  }
}

export function getActiveCreationReplaySnapshot(state: CreationReplayState) {
  return state.snapshots.find((snapshot) => snapshot.id === state.activeSnapshotId) ?? state.snapshots[0] ?? null
}

export function removeCreationReplaySnapshot(state: CreationReplayState, snapshotId: string): CreationReplayState {
  const snapshots = state.snapshots.filter((snapshot) => snapshot.id !== snapshotId)
  return {
    snapshots,
    activeSnapshotId: state.activeSnapshotId === snapshotId ? snapshots[0]?.id ?? null : state.activeSnapshotId,
  }
}

export function getCreationReplayMissingImageIds(snapshot: CreationReplaySnapshot, availableImageIds: Iterable<string>) {
  const available = new Set(availableImageIds)
  const requiredIds = [...snapshot.inputImageIds, snapshot.maskImageId ?? ''].filter(Boolean)
  return [...new Set(requiredIds.filter((id) => !available.has(id)))]
}

export function exportCreationReplaySnapshot(snapshot: CreationReplaySnapshot, exportedAt = Date.now()) {
  return JSON.stringify({
    kind: 'gpt-image-playground.creation-replay',
    version: 1,
    exportedAt,
    snapshot: normalizeCreationReplaySnapshot(snapshot, 0, exportedAt),
  }, null, 2)
}

export function parseCreationReplaySnapshot(raw: string, now = Date.now()) {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return null
    const snapshot = isRecord(parsed.snapshot) ? parsed.snapshot : parsed
    return normalizeCreationReplaySnapshot(snapshot, 0, now)
  } catch {
    return null
  }
}
