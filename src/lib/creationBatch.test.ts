import { describe, expect, it } from 'vitest'
import {
  createCreationBatchJob,
  createCreationBatchReproductionManifest,
  getCreationBatchDeliverySummary,
  getCreationBatchItemDeliverySummary,
  getCreationBatchItemPrompt,
  getCreationBatchProgress,
  loadCreationBatchState,
  normalizeCreationBatchState,
  patchCreationBatchItem,
  saveCreationBatchState,
} from './creationBatch'
import { createCreationProject } from './creationWorkspace'
import { DEFAULT_PARAMS, type TaskRecord, type TextVerificationReport, type VisualDifferenceReport } from '../types'

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

function createTask(id: string, outputImages: string[], patch: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    prompt: '批次提示词',
    params: DEFAULT_PARAMS,
    inputImageIds: ['source-image'],
    outputImages,
    status: 'done',
    error: null,
    createdAt: 1,
    finishedAt: 2,
    elapsed: 1,
    ...patch,
  }
}

function createTextReport(resultImageId: string, score: number, status: TextVerificationReport['status'] = 'passed'): TextVerificationReport {
  return {
    sourceImageId: 'source-image',
    resultImageId,
    checkedAt: 3,
    score,
    status,
    sourceTexts: ['标题'],
    resultTexts: ['标题'],
    missingTexts: [],
    changedTexts: [],
    numericChanges: [],
    summary: status === 'passed' ? '文字通过' : '文字需复核',
  }
}

function createVisualReport(resultImageId: string, fidelityScore: number, status: VisualDifferenceReport['status'] = 'passed'): VisualDifferenceReport {
  return {
    sourceImageId: 'source-image',
    resultImageId,
    checkedAt: 3,
    fidelityScore,
    status,
    summary: status === 'passed' ? '视觉通过' : '视觉需复核',
    changes: status === 'passed' ? [] : ['版式需要复核'],
    regions: [],
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

    expect(getCreationBatchProgress(failed)).toMatchObject({ total: 2, errors: 1, pending: 1, finished: 1, percent: 50 })
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
    expect(state.jobs[0].archivedAt).toBeNull()
  })

  it('aggregates existing OCR and visual reports without triggering analysis', () => {
    const project = createCreationProject('交付汇总', 100)
    project.series.variables = [{ id: 'version', name: '版本', values: ['A', 'B'] }]
    const job = createCreationBatchJob(project, '提示词', [], DEFAULT_PARAMS, 200)
    const completeTask = createTask('task-a', ['image-a'], {
      textVerificationByImage: { 'image-a': createTextReport('image-a', 96) },
      visualDifferenceByImage: { 'image-a': createVisualReport('image-a', 92) },
    })
    const partialTask = createTask('task-b', ['image-b'], {
      textVerificationByImage: { 'image-b': createTextReport('image-b', 88) },
    })
    const completedJob = {
      ...job,
      items: [
        { ...job.items[0], status: 'done' as const, taskId: completeTask.id },
        { ...job.items[1], status: 'done' as const, taskId: partialTask.id },
      ],
    }

    expect(getCreationBatchItemDeliverySummary(completedJob.items[0], completeTask)).toMatchObject({
      status: 'passed',
      outputCount: 1,
      completeOutputCount: 1,
      averageScore: 94,
    })
    expect(getCreationBatchDeliverySummary(completedJob, [completeTask, partialTask])).toMatchObject({
      status: 'partial',
      outputCount: 2,
      completeOutputCount: 1,
      partialOutputCount: 1,
      pendingOutputCount: 0,
      passedOutputCount: 1,
      averageScore: 94,
    })
  })

  it('keeps warning issues in the batch summary and produces a reproducible manifest', () => {
    const project = createCreationProject('复现项目', 100)
    const job = createCreationBatchJob(project, '基础提示词', ['source-image'], DEFAULT_PARAMS, 200)
    const task = createTask('task-warning', ['image-warning'], {
      textVerificationByImage: {
        'image-warning': {
          ...createTextReport('image-warning', 70, 'warning'),
          missingTexts: ['核心结论'],
        },
      },
      visualDifferenceByImage: { 'image-warning': createVisualReport('image-warning', 72, 'warning') },
    })
    const completedJob = {
      ...job,
      archivedAt: 500,
      items: [{ ...job.items[0], status: 'done' as const, taskId: task.id }],
    }
    const summary = getCreationBatchDeliverySummary(completedJob, [task])
    expect(summary).toMatchObject({ status: 'warning', warningOutputCount: 1, issueCount: 2 })
    expect(summary.issueLabels).toContain('缺失文字：核心结论')

    const manifest = createCreationBatchReproductionManifest(completedJob, [task])
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      kind: 'gpt-image-playground.creation-batch',
      batchId: completedJob.id,
      archivedAt: 500,
      inputImageIds: ['source-image'],
      items: [{ taskId: task.id, outputImageIds: ['image-warning'] }],
    })
    expect(JSON.stringify(manifest)).not.toContain('dataUrl')
  })
})
