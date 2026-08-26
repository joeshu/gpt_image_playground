import { useEffect, useMemo, useState } from 'react'
import type { ApiProfile, InputImage } from '../types'
import { enhancePrompt, PROMPT_ENHANCER_MAX_REFERENCE_IMAGES, type PromptEnhancementLevel, type PromptEnhancementResult } from '../lib/promptEnhancer'
import { savePromptVersion } from '../lib/promptVersionHistory'
import { compilePromptIntent, getPromptTaskTypeLabel, PROMPT_TASK_TYPE_OPTIONS, type PromptTaskType } from '../lib/promptCompiler'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

interface PromptEnhancerModalProps {
  open: boolean
  prompt: string
  profile: ApiProfile | null
  referenceImages?: InputImage[]
  referenceImageLabels?: string[]
  /** Agent 历史 @ 图片仍在 IndexedDB 读取时，禁止提前提交。 */
  referenceImagesLoading?: boolean
  onClose: () => void
  onApply: (prompt: string) => void
}

const LEVELS: Array<{ value: PromptEnhancementLevel; label: string; description: string }> = [
  { value: 'faithful', label: '忠实原意', description: '只补齐必要信息' },
  { value: 'balanced', label: '适度优化', description: '增强构图与质感' },
  { value: 'professional', label: '专业重写', description: '形成专业结构' },
]

const SECTION_LABELS: Array<[keyof PromptEnhancementResult['sections'], string]> = [
  ['subject', '主体'],
  ['scene', '场景'],
  ['composition', '构图'],
  ['lighting', '光线'],
  ['material', '材质'],
  ['color', '色彩'],
  ['constraints', '约束'],
]

export default function PromptEnhancerModal({ open, prompt, profile, referenceImages = [], referenceImageLabels = [], referenceImagesLoading = false, onClose, onApply }: PromptEnhancerModalProps) {
  const [level, setLevel] = useState<PromptEnhancementLevel>('balanced')
  const [taskTypeOverride, setTaskTypeOverride] = useState<PromptTaskType | null>(null)
  const [result, setResult] = useState<PromptEnhancementResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const detectedIntent = useMemo(() => compilePromptIntent(prompt), [prompt])
  const activeTaskType = taskTypeOverride ?? detectedIntent.taskType
  const referenceImageCount = Math.min(referenceImages.length, PROMPT_ENHANCER_MAX_REFERENCE_IMAGES)
  const referenceLabelSummary = referenceImageLabels
    .slice(0, PROMPT_ENHANCER_MAX_REFERENCE_IMAGES)
    .filter(Boolean)
    .join('、')

  useCloseOnEscape(open && !isLoading, onClose)
  usePreventBackgroundScroll(open)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError('')
    setLevel('balanced')
    setTaskTypeOverride(null)
  }, [open, prompt])

  if (!open) return null

  const handleEnhance = async () => {
    if (referenceImagesLoading) {
      setError('正在加载 @ 历史图片，请稍候')
      return
    }
    if (!profile?.apiKey) {
      setError('请先在 Agent 配置中设置支持 Responses API 的文本模型')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      savePromptVersion({ prompt, source: 'original' })
      const enhanced = await enhancePrompt({
        profile,
        prompt,
        level,
        taskType: activeTaskType,
        referenceImages,
        referenceImageLabels,
      })
      savePromptVersion({ prompt: enhanced.enhancedPrompt, source: 'enhanced', enhancementLevel: level })
      setResult(enhanced)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词增强失败')
    } finally {
      setIsLoading(false)
    }
  }

  const activeTaskTypeOption = PROMPT_TASK_TYPE_OPTIONS.find((option) => option.value === activeTaskType)

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="智能提示词增强"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">智能提示词增强</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">确认对比后才会替换当前输入</p>
          </div>
          <button type="button" onClick={onClose} disabled={isLoading} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {LEVELS.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={level === item.value}
                onClick={() => setLevel(item.value)}
                disabled={isLoading}
                className={`min-h-16 rounded-xl border px-2 py-2 text-left transition ${
                  level === item.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'border-gray-200 text-gray-600 dark:border-white/[0.08] dark:text-gray-300'
                }`}
              >
                <div className="text-xs font-semibold">{item.label}</div>
                <div className="mt-1 text-[10px] opacity-70">{item.description}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-3 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-blue-700 dark:text-blue-300">任务类型</div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  自动识别为「{getPromptTaskTypeLabel(detectedIntent.taskType)}」 · 置信度 {Math.round(detectedIntent.confidence * 100)}%
                </p>
              </div>
              <select
                value={activeTaskType}
                onChange={(event) => setTaskTypeOverride(event.target.value as PromptTaskType)}
                disabled={isLoading}
                className="min-h-10 max-w-[9rem] rounded-lg border border-blue-200 bg-white px-2 text-xs font-medium text-blue-700 outline-none dark:border-blue-500/25 dark:bg-white/[0.06] dark:text-blue-200"
                aria-label="选择任务类型"
              >
                {PROMPT_TASK_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">{activeTaskTypeOption?.description}</p>
          </div>

          {activeTaskType === 'state-owned-ppt' && (
            <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700 dark:bg-red-500/10 dark:text-red-300">
              国企汇报 PPT 将优先采用 16:9 横版、正式克制的政企商务风格，并保护政治表述、业务事实和关键数据。
            </div>
          )}

          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
            {referenceImageCount > 0
              ? `本次将分析 ${referenceImageCount} 张参考图的版式、色彩、层级、留白与风格；不会自动改写当前业务事实。`
              : '未附带参考图；上传或 @ 引用图片后，增强器可感知其版式和风格。'}
            {referenceImagesLoading && (
              <div className="mt-1 text-[10px] text-blue-600 dark:text-blue-300">正在加载 Agent 历史 @ 引用…</div>
            )}
            {referenceLabelSummary && (
              <div className="mt-1 truncate text-[10px] text-blue-600 dark:text-blue-300">已映射引用：{referenceLabelSummary}</div>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">增强前</div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-200">{prompt}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-500/20 dark:bg-blue-500/[0.06]">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-300">增强后 · {result?.taskType ? getPromptTaskTypeLabel(result.taskType) : activeTaskTypeOption?.label}</div>
              {result ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-gray-100">{result.enhancedPrompt}</p>
              ) : (
                <p className="mt-2 text-sm text-gray-400">{isLoading ? '正在整理主体、场景、构图、光线、材质、色彩和约束…' : '选择强度后开始增强'}</p>
              )}
            </div>
          </div>

          {result?.summary && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
              {result.summary}
            </div>
          )}

          {result?.referenceNotes && (
            <div className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">
              <div className="font-medium">参考图分析</div>
              <div className="mt-1 leading-relaxed">{result.referenceNotes}</div>
            </div>
          )}
          {result && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SECTION_LABELS.flatMap(([key, label]) => result.sections[key] ? [(
                <div key={key} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
                  <div className="text-[10px] font-medium text-gray-400">{label}</div>
                  <div className="mt-1 text-xs text-gray-700 dark:text-gray-200">{result.sections[key]}</div>
                </div>
              )] : [])}
            </div>
          )}

          {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-white/[0.08]">
          <button type="button" onClick={handleEnhance} disabled={isLoading || referenceImagesLoading || !prompt.trim()} className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50">
            {isLoading ? '增强中…' : referenceImagesLoading ? '读取引用…' : result ? '重新增强' : '开始增强'}
          </button>
          <button
            type="button"
            disabled={!result || isLoading}
            onClick={() => {
              if (!result) return
              onApply(result.enhancedPrompt)
              onClose()
            }}
            className="min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            应用增强结果
          </button>
        </footer>
      </section>
    </div>
  )
}
