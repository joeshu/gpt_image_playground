import { useCallback, useEffect, useMemo, useState } from 'react'
import { editOutputs, removeTask, reuseConfig, useStore } from '../store'
import type { CreationBatchJob, TaskRecord } from '../types'
import { getCommercialDeliveryCheck } from '../lib/commercialDeliveryCheck'
import {
  CREATION_BATCH_CHANGED_EVENT,
  getCreationBatchDeliverySummary,
  getCreationBatchProgress,
  loadCreationBatchState,
} from '../lib/creationBatch'
import { taskMatchesSearchQuery } from '../store'
import TaskCard from './TaskCard'

type ResultsTab = 'outputs' | 'review' | 'batches'
type TaskStatusFilter = 'all' | 'running' | 'done' | 'error'

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTaskDeliveryChecks(task: TaskRecord) {
  return task.outputImages.map((imageId) => getCommercialDeliveryCheck(
    task.textVerificationByImage?.[imageId],
    task.visualDifferenceByImage?.[imageId],
  ))
}

function taskNeedsReview(task: TaskRecord) {
  return task.status === 'done'
    && task.outputImages.length > 0
    && getTaskDeliveryChecks(task).some((check) => check.status !== 'passed')
}

function getBatchStatusLabel(status: CreationBatchJob['status']) {
  return {
    draft: '待开始',
    running: '生成中',
    paused: '已暂停',
    completed: '已完成',
    failed: '需重试',
    cancelled: '已取消',
  }[status]
}

function getBatchStatusClass(status: CreationBatchJob['status']) {
  return {
    draft: 'bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300',
    running: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
    paused: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
    completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    failed: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
    cancelled: 'bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400',
  }[status]
}

function MetricCard({ label, value, hint, tone = 'blue' }: { label: string; value: number; hint: string; tone?: 'blue' | 'emerald' | 'amber' | 'violet' }) {
  const toneClass = {
    blue: 'border-blue-100 bg-blue-50/70 text-blue-700 dark:border-blue-500/15 dark:bg-blue-500/[0.06] dark:text-blue-300',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-500/15 dark:bg-emerald-500/[0.06] dark:text-emerald-300',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-500/15 dark:bg-amber-500/[0.06] dark:text-amber-300',
    violet: 'border-violet-100 bg-violet-50/70 text-violet-700 dark:border-violet-500/15 dark:bg-violet-500/[0.06] dark:text-violet-300',
  }[tone]
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-[11px] opacity-75">{hint}</div>
    </div>
  )
}

function BatchArchive({ jobs, tasks, onOpenWorkbench, onOpenTask }: { jobs: CreationBatchJob[]; tasks: TaskRecord[]; onOpenWorkbench: () => void; onOpenTask: (taskId: string) => void }) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-white/[0.12] dark:bg-white/[0.03]">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">还没有批量任务</div>
        <p className="mt-1 text-xs text-gray-400">在创作工作台的“系列与批量”中建立批次，结果会自动归档到这里。</p>
        <button type="button" onClick={onOpenWorkbench} className="mt-4 min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700">打开创作工作台</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {jobs.map((job) => {
        const progress = getCreationBatchProgress(job)
        const delivery = getCreationBatchDeliverySummary(job, tasks)
        const taskIds = job.items.map((item) => item.taskId).filter((taskId): taskId is string => Boolean(taskId && tasks.some((task) => task.id === taskId)))
        return (
          <article key={job.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">{job.projectSnapshot.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getBatchStatusClass(job.status)}`}>{getBatchStatusLabel(job.status)}</span>
                  {job.archivedAt && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">已归档</span>}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatTime(job.createdAt)} · {job.items.length} 个组合 · {job.projectSnapshot.series.aspectRatio}</p>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-300">{progress.percent}%</div>
                <div className="text-[10px] text-gray-400">{progress.finished} / {progress.total} 已处理</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span>输出 {delivery.outputCount}</span>
              <span>可交付 {delivery.passedOutputCount}</span>
              <span>待复核 {delivery.warningOutputCount + delivery.partialOutputCount + delivery.pendingOutputCount}</span>
              {delivery.averageScore !== null && <span>平均 {delivery.averageScore} 分</span>}
            </div>
            {taskIds.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {taskIds.slice(0, 3).map((taskId, index) => (
                  <button key={taskId} type="button" onClick={() => onOpenTask(taskId)} className="min-h-9 rounded-lg bg-blue-50 px-3 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
                    查看结果 {index + 1}
                  </button>
                ))}
                {taskIds.length > 3 && <span className="self-center text-[11px] text-gray-400">还有 {taskIds.length - 3} 个</span>}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export default function ResultsCenter({ onClose, onOpenCreationWorkbench }: { onClose: () => void; onOpenCreationWorkbench: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const [activeTab, setActiveTab] = useState<ResultsTab>('outputs')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all')
  const [batchJobs, setBatchJobs] = useState<CreationBatchJob[]>(() => loadCreationBatchState().jobs)
  const refreshBatchJobs = useCallback(() => {
    setBatchJobs(loadCreationBatchState().jobs)
  }, [])

  useEffect(() => {
    refreshBatchJobs()
  }, [activeTab, refreshBatchJobs, tasks])

  useEffect(() => {
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      scrollToTop()
      window.requestAnimationFrame(scrollToTop)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const handleBatchChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ jobs?: CreationBatchJob[] }>).detail
      if (Array.isArray(detail?.jobs)) {
        setBatchJobs(detail.jobs)
      } else {
        refreshBatchJobs()
      }
    }
    window.addEventListener(CREATION_BATCH_CHANGED_EVENT, handleBatchChanged)
    return () => window.removeEventListener(CREATION_BATCH_CHANGED_EVENT, handleBatchChanged)
  }, [refreshBatchJobs])

  const taskStats = useMemo(() => {
    const outputTasks = tasks.filter((task) => task.outputImages.length > 0)
    const checks = outputTasks
      .filter((task) => task.status === 'done')
      .flatMap(getTaskDeliveryChecks)
    return {
      outputTasks: outputTasks.length,
      running: tasks.filter((task) => task.status === 'running').length,
      review: checks.filter((check) => check.status !== 'passed').length,
      passed: checks.filter((check) => check.status === 'passed').length,
    }
  }, [tasks])

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return [...tasks]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((task) => {
        if (activeTab === 'review' && !taskNeedsReview(task)) return false
        if (activeTab === 'outputs' && statusFilter !== 'all' && task.status !== statusFilter) return false
        return taskMatchesSearchQuery(task, normalizedQuery)
      })
  }, [activeTab, query, statusFilter, tasks])

  const handleDelete = (task: TaskRecord) => {
    setConfirmDialog({
      title: '删除任务',
      message: '确定要删除这个任务吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  return (
    <main data-results-center className="min-h-[100svh] bg-gray-50 pb-8 dark:bg-gray-950">
      <div data-results-content className="safe-area-x mx-auto w-full min-w-0 max-w-7xl px-0 pt-4 sm:pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={onClose} className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-500 transition hover:bg-white hover:text-gray-800 dark:hover:bg-white/[0.06] dark:hover:text-gray-200">← 返回创作</button>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Results & delivery</div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">结果与交付中心</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">统一查看生成结果、批量进度和商业交付检查；所有检查仍由你手动触发，不会自动增加 AI 调用。</p>
          </div>
          <button type="button" onClick={onOpenCreationWorkbench} className="min-h-11 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-blue-700">打开创作工作台</button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="结果任务" value={taskStats.outputTasks} hint="已有输出图片的任务" />
          <MetricCard label="可交付图片" value={taskStats.passed} hint="文字与视觉检查均通过" tone="emerald" />
          <MetricCard label="待复核图片" value={taskStats.review} hint="未检查完整或存在风险" tone="amber" />
          <MetricCard label="进行中任务" value={taskStats.running} hint="正在生成或等待恢复" tone="violet" />
        </div>

        <div className="mt-6 flex touch-pan-x overscroll-x-contain gap-1 overflow-x-auto rounded-xl [-webkit-overflow-scrolling:touch] border border-gray-200 bg-white/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
          {[
            ['outputs', '全部结果'],
            ['review', `待复核 ${taskStats.review}`],
            ['batches', `批量任务 ${batchJobs.length}`],
          ].map(([value, label]) => (
            <button key={value} type="button" onClick={() => setActiveTab(value as ResultsTab)} className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-medium transition ${activeTab === value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}>{label}</button>
          ))}
        </div>

        {activeTab === 'batches' ? (
          <div className="mt-4"><BatchArchive jobs={batchJobs} tasks={tasks} onOpenWorkbench={onOpenCreationWorkbench} onOpenTask={setDetailTaskId} /></div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词或任务内容…" className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-100 dark:focus:ring-blue-500/10" aria-label="搜索结果" />
              {activeTab === 'outputs' && (
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatusFilter)} className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200" aria-label="结果状态">
                  <option value="all">全部状态</option>
                  <option value="done">已完成</option>
                  <option value="running">生成中</option>
                  <option value="error">失败</option>
                </select>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 pb-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => setDetailTaskId(task.id)}
                  onReuse={() => reuseConfig(task)}
                  onEditOutputs={() => editOutputs(task)}
                  onDelete={() => handleDelete(task)}
                  isSelected={false}
                  disableSwipe
                />
              ))}
            </div>
            {visibleTasks.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center dark:border-white/[0.12] dark:bg-white/[0.03]">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{activeTab === 'review' ? '当前没有待复核结果' : '没有匹配的结果'}</div>
                <p className="mt-1 text-xs text-gray-400">可调整搜索条件，或返回创作页面建立新的生成任务。</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
