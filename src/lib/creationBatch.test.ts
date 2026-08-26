import { describe, expect, it } from 'vitest'
import {
  createCreationBatchJob,
  getCreationBatchItemPrompt,
  getCreationBatchProgress,
  loadCreationBatchState,
  normalizeCreationBatchState,
  patchCreationBatchItem,
  saveCreationBatchState,
} from './creationBatch'
import { createCreationProject } from './creationWorkspace'
import { DEFAULT_PARAMS } from '../types'

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('creation batch queue', () => {
  it('creates a deterministic item for every variable combination', () => {
    const project = createCreationProject('系列项目', 100)
    project.series.variables = [
      { id: 'scene', name: '场景', values: ['会议室', '展厅'] },
      { id: 'page', name: '页型', values: ['分析', '举措'] },
    ]

    const job = createCreationBatchJob(project, '原始提示词', ['image-a'], DEFAULT_PARAMS, 200)

    expect(job.items).toHaveLength(4)
    expect(job.items[0].variableValues).toEqual({ scene: '会议室', page: '分析' })
    expect(getCreationBatchItemPrompt(job, job.items[1])).toContain('本次批量变量组合：')
    expect(getCreationBatchItemPrompt(job, job.items[1])).toContain('页型：举措')
  })

  it('persists a running job as paused for safe manual resume', () => {
    const project = createCreationProject('恢复项目', 100)
    const job = createCreationBatchJob(project, '提示词', [], DEFAULT_PARAMS, 200)
    const state = { jobs: [{ ...job, status: 'running' as const }], activeJobId: job.id }
    const storage = createMemoryStorage()

    expect(saveCreationBatchState(state, storage)).toBe(true)
    expect(loadCreationBatchState(storage, 300).jobs[0].status).toBe('paused')
  })

  it('tracks progress and retains an item error for retry', () => {
    const project = createCreationProject('重试项目', 100)
    project.series.variables = [{ id: 'version', name: '版本', values: ['A', 'B'] }]
    const job = createCreationBatchJob(project, '提示词', [], DEFAULT_PARAMS, 200)
    const failed = patchCreationBatchItem(job, job.items[0].id, {
      status: 'error',
      attempts: 1,
      error: '网络超时',
      finishedAt: 250,
    }, 250)

    expect(getCreationBatchProgress(failed)).toMatchObject({ total: 2, errors: 1, pending: 1, percent: 0 })
    expect(failed.items[0].error).toBe('网络超时')
  })

  it('normalizes duplicate jobs and invalid queue fields', () => {
    const state = normalizeCreationBatchState({
      activeJobId: 'job-a',
      jobs: [{ id: 'job-a', items: [{ id: 'item', status: 'unknown', attempts: -2 }] }, { id: 'job-a' }],
    }, 500)

    expect(state.jobs).toHaveLength(2)
    expect(state.jobs[0].items[0].status).toBe('pending')
    expect(state.jobs[0].items[0].attempts).toBe(0)
    expect(state.jobs[1].id).not.toBe('job-a')
  })
})
