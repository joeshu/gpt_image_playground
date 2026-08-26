import { useEffect, useMemo, useRef, useState } from 'react'
import { getImage, storeImage } from '../lib/db'
import {
  MAX_CREATION_BATCH_JOBS,
  createCreationBatchJob,
  getCreationBatchItemPrompt,
  getCreationBatchProgress,
  loadCreationBatchState,
  patchCreationBatchItem,
  patchCreationBatchJob,
  removeCreationBatchJob,
  saveCreationBatchState,
} from '../lib/creationBatch'
import { submitTask, useStore } from '../store'
import type { CreationBatchJob, CreationBatchItem, CreationProject, InputImage, TaskRecord } from '../types'

interface CreationBatchPanelProps {
  project: CreationProject
  currentPrompt: string
  inputImages: InputImage[]
  onBusyChange?: (busy: boolean) => void
}

function getJobStatusLabel(status: CreationBatchJob['status']) {
  return {
    draft: '待开始',
    running: '生成中',
    paused: '已暂停',
    completed: '已完成',
    failed: '需重试',
    cancelled: '已取消',
  }[status]
}

function getItemStatusLabel(status: CreationBatchItem['status']) {
  return {
    pending: '待生成',
    running: '生成中',
    done: '已完成',
    error: '失败',
    cancelled: '已取消',
  }[status]
}

function getItemStatusClass(status: CreationBatchItem['status']) {
  return {
    pending: 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300',
    running: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    error: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    cancelled: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  }[status]
}

function getJobStatusClass(status: CreationBatchJob['status']) {
  return {
    draft: 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300',
    running: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    paused: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    failed: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400',
  }[status]
}

function formatJobTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getVariableSummary(item: CreationBatchItem) {
  const values = Object.values(item.variableValues)
  return values.length > 0 ? values.join(' · ') : '默认组合'
}

async function loadBatchImages(imageIds: string[]) {
  const currentImages = useStore.getState().inputImages
  const images: InputImage[] = []
  for (const id of imageIds) {
    const current = currentImages.find((image) => image.id === id)
    if (current?.dataUrl) {
      images.push(current)
      continue
    }
    const stored = await getImage(id)
    if (!stored?.dataUrl) throw new Error(`找不到批量任务所需的参考图：${id}`)
    images.push({ id: stored.id, dataUrl: stored.dataUrl })
  }
  return images
}

function waitForTask(taskId: string): Promise<Pick<TaskRecord, 'status' | 'error'>> {
  return new Promise((resolve) => {
    let missingChecks = 0
    const check = () => {
      const task = useStore.getState().tasks.find((item) => item.id === taskId)
      if (task && task.status !== 'running') {
        resolve({ status: task.status, error: task.error })
        return
      }
      if (!task) {
        missingChecks += 1
        if (missingChecks >= 120) {
          resolve({ status: 'error', error: '任务记录长时间不可见，已停止等待' })
          return
        }
      } else {
        missingChecks = 0
      }
      window.setTimeout(check, 500)
    }
    check()
  })
}

export default function CreationBatchPanel({ project, currentPrompt, inputImages, onBusyChange }: CreationBatchPanelProps) {
  const [batchState, setBatchState] = useState(() => loadCreationBatchState())
  const batchStateRef = useRef(batchState)
  const runnerRef = useRef(false)
  const stopRequestedRef = useRef(false)
  const [creating, setCreating] = useState(false)
  const tasks = useStore((state) => state.tasks)
  const showToast = useStore((state) => state.showToast)
  const activeJob = useMemo(
    () => batchState.jobs.find((job) => job.id === batchState.activeJobId) ?? batchState.jobs[0] ?? null,
    [batchState],
  )

  useEffect(() => {
    saveCreationBatchState(batchState)
  }, [batchState])

  const replaceBatchState = (updater: (state: typeof batchState) => typeof batchState) => {
    const next = updater(batchStateRef.current)
    batchStateRef.current = next
    setBatchState(next)
  }

  useEffect(() => {
    const tasksById = new Map(tasks.map((task) => [task.id, task]))
    let changed = false
    const nextState = batchStateRef.current.jobs.reduce<typeof batchState>((state, job) => {
      let nextJob = job
      for (const item of job.items) {
        if (!item.taskId) continue
        const task = tasksById.get(item.taskId)
        if (!task) continue
        if (task.status === 'done' && item.status !== 'done') {
          nextJob = patchCreationBatchItem(nextJob, item.id, { status: 'done', error: null, finishedAt: task.finishedAt ?? Date.now() })
          changed = true
        } else if (task.status === 'error' && item.status !== 'error') {
          nextJob = patchCreationBatchItem(nextJob, item.id, { status: 'error', error: task.error || '生成任务失败', finishedAt: task.finishedAt ?? Date.now() })
          changed = true
        } else if (task.status === 'running' && item.status !== 'running') {
          nextJob = patchCreationBatchItem(nextJob, item.id, { status: 'running' })
          changed = true
        }
      }
      const progress = getCreationBatchProgress(nextJob)
      if (nextJob.status === 'running' && progress.errors > 0) {
        nextJob = patchCreationBatchJob(nextJob, { status: 'failed' })
        changed = true
      } else if (nextJob.status === 'running' && progress.pending === 0 && progress.running === 0 && progress.errors === 0) {
        nextJob = patchCreationBatchJob(nextJob, { status: 'completed' })
        changed = true
      }
      state.jobs.push(nextJob)
      return state
    }, { jobs: [], activeJobId: batchStateRef.current.activeJobId })
    if (changed) {
      batchStateRef.current = nextState
      setBatchState(nextState)
    }
  }, [tasks])

  const setRunnerBusy = (busy: boolean) => {
    onBusyChange?.(busy)
  }

  const updateJob = (jobId: string, updater: (job: CreationBatchJob) => CreationBatchJob) => {
    replaceBatchState((state) => ({
      ...state,
      jobs: state.jobs.map((job) => job.id === jobId ? updater(job) : job),
    }))
  }

  const handleCreateJob = async () => {
    if (runnerRef.current || creating) return
    if (!currentPrompt.trim() && !project.series.subject.trim()) {
      showToast('请先填写当前提示词或系列主体，再建立批量任务', 'info')
      return
    }
    if (useStore.getState().maskDraft) {
      showToast('批量生成暂不支持遮罩，请先返回输入栏完成或清除遮罩', 'info')
      return
    }
    setCreating(true)
    try {
      const referenceIds = [...new Set([...inputImages.map((image) => image.id), ...project.brand.referenceImageIds])]
      const images = await loadBatchImages(referenceIds)
      const storedIds = await Promise.all(images.map((image) => storeImage(image.dataUrl, 'upload')))
      const job = createCreationBatchJob(project, currentPrompt, storedIds, useStore.getState().params)
      replaceBatchState((state) => ({
        jobs: [job, ...state.jobs].slice(0, MAX_CREATION_BATCH_JOBS),
        activeJobId: job.id,
      }))
      showToast(`已建立 ${job.items.length} 个批量组合，尚未开始生成`, 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '批量任务建立失败', 'error')
    } finally {
      setCreating(false)
    }
  }

  const markJobFinished = (jobId: string, status: CreationBatchJob['status']) => {
    updateJob(jobId, (job) => patchCreationBatchJob(job, { status }))
  }

  const runJob = async (jobId: string) => {
    try {
      while (true) {
        const job = batchStateRef.current.jobs.find((item) => item.id === jobId)
        if (!job || job.status === 'cancelled') break
        if (stopRequestedRef.current) {
          if (job.status === 'running') markJobFinished(jobId, 'paused')
          break
        }

        const runningItem = job.items.find((item) => item.status === 'running')
        const nextItem = runningItem ?? job.items.find((item) => item.status === 'pending' || item.status === 'error')
        if (!nextItem) {
          const progress = getCreationBatchProgress(job)
          markJobFinished(jobId, progress.errors > 0 ? 'failed' : progress.pending === 0 && progress.running === 0 ? 'completed' : 'paused')
          break
        }
        if (nextItem.status === 'error') {
          markJobFinished(jobId, 'failed')
          break
        }

        let taskId = nextItem.taskId
        if (nextItem.status === 'running' && taskId) {
          const existingTask = useStore.getState().tasks.find((task) => task.id === taskId)
          if (!existingTask) {
            updateJob(jobId, (current) => patchCreationBatchItem(current, nextItem.id, { status: 'pending', taskId: null }))
            continue
          }
        } else {
          updateJob(jobId, (current) => patchCreationBatchItem(current, nextItem.id, {
            status: 'running',
            taskId: null,
            attempts: nextItem.attempts + 1,
            error: null,
            startedAt: Date.now(),
            finishedAt: null,
          }))
          const images = await loadBatchImages(job.inputImageIds)
          if (stopRequestedRef.current || batchStateRef.current.jobs.find((item) => item.id === jobId)?.status !== 'running') break
          const beforeTaskIds = new Set(useStore.getState().tasks.map((task) => task.id))
          const prompt = getCreationBatchItemPrompt(job, nextItem)
          if (useStore.getState().maskDraft) throw new Error('批量生成检测到遮罩，请先清除遮罩后再继续')
          useStore.getState().setParams(job.params)
          useStore.getState().setInputImages(images)
          useStore.getState().setPrompt(prompt)
          await submitTask()
          const createdTask = useStore.getState().tasks.find((task) => !beforeTaskIds.has(task.id))
          if (!createdTask) throw new Error('任务未提交，请检查 API 配置、网络状态和提示词')
          taskId = createdTask.id
          updateJob(jobId, (current) => patchCreationBatchItem(current, nextItem.id, { taskId, status: 'running' }))
        }

        if (!taskId) throw new Error('批量任务缺少任务 ID')
        const result = await waitForTask(taskId)
        if (result.status === 'done') {
          updateJob(jobId, (current) => patchCreationBatchItem(current, nextItem.id, { status: 'done', error: null, finishedAt: Date.now() }))
          continue
        }
        updateJob(jobId, (current) => patchCreationBatchItem(current, nextItem.id, { status: 'error', error: result.error || '生成任务失败', finishedAt: Date.now() }))
        markJobFinished(jobId, 'failed')
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '批量任务执行失败'
      const current = batchStateRef.current.jobs.find((item) => item.id === jobId)
      const runningItem = current?.items.find((item) => item.status === 'running')
      if (runningItem) updateJob(jobId, (job) => patchCreationBatchItem(job, runningItem.id, { status: 'error', error: message, finishedAt: Date.now() }))
      if (batchStateRef.current.jobs.find((item) => item.id === jobId)?.status !== 'cancelled') markJobFinished(jobId, 'failed')
      showToast(message, 'error')
    } finally {
      runnerRef.current = false
      setRunnerBusy(false)
    }
  }

  const handleStartJob = (jobId: string) => {
    if (runnerRef.current) return
    const job = batchStateRef.current.jobs.find((item) => item.id === jobId)
    if (!job || job.status === 'completed' || job.status === 'cancelled') return
    stopRequestedRef.current = false
    updateJob(jobId, (current) => patchCreationBatchJob(current, { status: 'running' }))
    runnerRef.current = true
    setRunnerBusy(true)
    void runJob(jobId)
  }

  const handlePauseJob = (jobId: string) => {
    stopRequestedRef.current = true
    updateJob(jobId, (job) => job.status === 'running' ? patchCreationBatchJob(job, { status: 'paused' }) : job)
    showToast('已暂停后续批量提交，当前已发出的任务会继续完成', 'info')
  }

  const handleCancelJob = (jobId: string) => {
    stopRequestedRef.current = true
    updateJob(jobId, (job) => patchCreationBatchJob({
      ...job,
      items: job.items.map((item) => item.status === 'pending' || item.status === 'error'
        ? { ...item, status: 'cancelled', error: item.error ?? null }
        : item),
    }, { status: 'cancelled' }))
    showToast('已取消未提交的批量组合，当前已发出的任务不会被强制中断', 'info')
  }

  const handleRetryItem = (jobId: string, itemId: string) => {
    if (runnerRef.current) return
    updateJob(jobId, (job) => patchCreationBatchJob(patchCreationBatchItem(job, itemId, {
      status: 'pending',
      taskId: null,
      error: null,
      finishedAt: null,
    }), { status: 'paused' }))
  }

  const handleRetryErrors = (jobId: string) => {
    if (runnerRef.current) return
    updateJob(jobId, (job) => {
      const next = job.items.reduce((current, item) => item.status === 'error'
        ? patchCreationBatchItem(current, item.id, { status: 'pending', taskId: null, error: null, finishedAt: null })
        : current, job)
      return patchCreationBatchJob(next, { status: 'paused' })
    })
    showToast('失败组合已重新排队，请点击开始生成', 'success')
  }

  const handleDeleteJob = (jobId: string) => {
    if (runnerRef.current) return
    replaceBatchState((state) => removeCreationBatchJob(state, jobId))
  }

  const progress = activeJob ? getCreationBatchProgress(activeJob) : null
  const visibleItems = activeJob?.items.slice(0, 8) ?? []

  return (
    <div data-creation-batch-panel className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">批量任务队列</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">本机保存</span>
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">先建立组合预览，再由你手动开始。队列一次只提交一个图片任务，失败会停在当前组合，避免连续消耗调用额度。</p>
        </div>
        <button type="button" onClick={() => void handleCreateJob()} disabled={creating || runnerRef.current} className="min-h-10 shrink-0 rounded-xl bg-blue-600 px-3.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{creating ? '正在准备…' : '建立批量任务'}</button>
      </div>

      {batchState.jobs.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">当前批次</span><select value={activeJob?.id ?? ''} onChange={(event) => replaceBatchState((state) => ({ ...state, activeJobId: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100" aria-label="当前批量任务">{batchState.jobs.map((job) => <option key={job.id} value={job.id}>{formatJobTime(job.createdAt)} · {job.projectSnapshot.name} · {job.items.length} 组合 · {getJobStatusLabel(job.status)}</option>)}</select></label>
          <div className="flex gap-2">
            {activeJob && activeJob.status === 'running' ? <button type="button" onClick={() => handlePauseJob(activeJob.id)} className="min-h-11 rounded-xl bg-amber-500 px-3 text-xs font-medium text-white hover:bg-amber-600">暂停</button> : activeJob && activeJob.status !== 'completed' && activeJob.status !== 'cancelled' ? <button type="button" onClick={() => handleStartJob(activeJob.id)} disabled={runnerRef.current} className="min-h-11 rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{activeJob.status === 'paused' || activeJob.status === 'failed' ? '继续生成' : '开始生成'}</button> : null}
            {activeJob && (activeJob.status === 'running' || activeJob.status === 'paused') && <button type="button" onClick={() => handleCancelJob(activeJob.id)} className="min-h-11 rounded-xl border border-red-200 px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:hover:bg-red-500/10">取消未提交</button>}
            {activeJob && !runnerRef.current && <button type="button" onClick={() => handleDeleteJob(activeJob.id)} className="min-h-11 rounded-xl border border-gray-200 px-3 text-xs font-medium text-gray-500 hover:bg-gray-50 dark:border-white/[0.1] dark:hover:bg-white/[0.06]">删除记录</button>}
          </div>
        </div>
      )}

      {!activeJob && <div className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-xs text-gray-500 dark:border-white/[0.15] dark:text-gray-400">填写变量后点击“建立批量任务”，这里会先显示全部组合和预计调用数量。</div>}

      {activeJob && progress && (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-blue-900 dark:text-blue-100">{activeJob.projectSnapshot.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getJobStatusClass(activeJob.status)}`}>{getJobStatusLabel(activeJob.status)}</span></div><div className="mt-1 text-xs text-blue-700/80 dark:text-blue-200/80">建立于 {formatJobTime(activeJob.createdAt)} · 项目规则已快照保存</div></div>
            <div className="text-left sm:text-right"><div className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-200">{progress.done} / {progress.total}</div><div className="text-[10px] text-blue-700/70 dark:text-blue-200/70">已完成 · 失败 {progress.errors} · 待生成 {progress.pending}</div></div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/15"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress.percent}%` }} /></div>
          {progress.errors > 0 && <div className="mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between"><span>队列已停在失败组合。修复配置或网络后，可以只重试失败项。</span><button type="button" onClick={() => handleRetryErrors(activeJob.id)} disabled={runnerRef.current} className="self-start rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-medium text-red-700 shadow-sm hover:bg-red-100 disabled:opacity-50 dark:bg-white/[0.08] dark:text-red-200">重试失败项</button></div>}
        </div>
      )}

      {activeJob && visibleItems.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 dark:border-white/[0.08]">
          <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] gap-2 bg-gray-50 px-3 py-2 text-[10px] font-medium text-gray-400 dark:bg-white/[0.04] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"><span>#</span><span>变量组合</span><span>状态</span><span>操作</span></div>
          <div className="divide-y divide-gray-100 dark:divide-white/[0.06]">
            {visibleItems.map((item, index) => <div key={item.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5 text-xs sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]"><span className="tabular-nums text-gray-400">{index + 1}</span><div className="min-w-0"><div className="truncate text-gray-700 dark:text-gray-200">{getVariableSummary(item)}</div><div className="mt-0.5 text-[10px] text-gray-400">尝试 {item.attempts} 次{item.error ? ` · ${item.error}` : ''}</div></div><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-medium ${getItemStatusClass(item.status)}`}>{getItemStatusLabel(item.status)}</span>{item.status === 'error' && !runnerRef.current ? <button type="button" onClick={() => handleRetryItem(activeJob.id, item.id)} className="rounded-lg px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10">重试</button> : <span className="w-8" />}</div>)}
          </div>
          {activeJob.items.length > visibleItems.length && <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400 dark:border-white/[0.06]">其余 {activeJob.items.length - visibleItems.length} 个组合已保存在队列中。</div>}
        </div>
      )}
    </div>
  )
}
