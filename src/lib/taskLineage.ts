import type { TaskRecord } from '../types'

export interface TaskLineage {
  parent: TaskRecord | null
  children: TaskRecord[]
}

export interface TaskComparisonImageIds {
  beforeImageId: string
  afterImageId: string
}

export function getTaskComparisonImageIds(
  task: TaskRecord,
  parent: TaskRecord | null,
  selectedOutputImageId = '',
): TaskComparisonImageIds | null {
  if (!parent) return null

  const beforeImageId = parent.outputImages.find((id) => task.inputImageIds.includes(id))
    ?? parent.outputImages[0]
    ?? ''
  const afterImageId = selectedOutputImageId || task.outputImages[0] || ''

  return beforeImageId && afterImageId ? { beforeImageId, afterImageId } : null
}

export function getTaskLineage(task: TaskRecord, tasks: TaskRecord[]): TaskLineage {
  const inputIds = new Set(task.inputImageIds)
  const parent = tasks
    .filter((candidate) =>
      candidate.id !== task.id &&
      candidate.createdAt <= task.createdAt &&
      candidate.outputImages.some((id) => inputIds.has(id)),
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null

  const outputIds = new Set(task.outputImages)
  const children = tasks
    .filter((candidate) =>
      candidate.id !== task.id &&
      candidate.createdAt >= task.createdAt &&
      candidate.inputImageIds.some((id) => outputIds.has(id)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)

  return { parent, children }
}
