import { useEffect, useMemo, useState } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  buildStateOwnedPptPrompt,
  DEFAULT_STATE_OWNED_PPT_BRIEF,
  getStateOwnedPptBriefCompletion,
  STATE_OWNED_PPT_PAGE_TYPES,
  validateStateOwnedPptBrief,
  type StateOwnedPptBrief,
} from '../lib/stateOwnedPptBrief'

interface StateOwnedPptBriefModalProps {
  open: boolean
  currentPrompt: string
  onClose: () => void
  onApply: (prompt: string) => void
}

const FIELDS: Array<{ key: keyof Pick<StateOwnedPptBrief, 'topic' | 'audience' | 'background' | 'problems' | 'goals' | 'initiatives' | 'data' | 'conclusion'>; label: string; placeholder: string }> = [
  { key: 'topic', label: '汇报主题', placeholder: '例如：2026 年存量经营提升工作' },
  { key: 'audience', label: '汇报对象', placeholder: '例如：省公司领导、地市负责人' },
  { key: 'background', label: '背景 / 现状', placeholder: '当前形势、政策背景、业务现状…' },
  { key: 'problems', label: '核心问题', placeholder: '需要解决的主要问题、短板和原因…' },
  { key: 'goals', label: '目标 / 指标', placeholder: '目标值、时间节点、考核指标…' },
  { key: 'initiatives', label: '重点举措', placeholder: '重点动作、责任分工、推进路径…' },
  { key: 'data', label: '数据 / 图表', placeholder: '需要展示的指标、趋势、同比或对比数据…' },
  { key: 'conclusion', label: '结论 / 请求', placeholder: '页面结论、需要领导决策或支持的事项…' },
]

export default function StateOwnedPptBriefModal({ open, currentPrompt, onClose, onApply }: StateOwnedPptBriefModalProps) {
  const [brief, setBrief] = useState<StateOwnedPptBrief>(DEFAULT_STATE_OWNED_PPT_BRIEF)
  const [error, setError] = useState('')

  useCloseOnEscape(open, onClose)
  usePreventBackgroundScroll(open)

  useEffect(() => {
    if (!open) return
    setBrief(DEFAULT_STATE_OWNED_PPT_BRIEF)
    setError('')
  }, [open])

  const completion = useMemo(() => getStateOwnedPptBriefCompletion(brief), [brief])
  const preview = useMemo(() => buildStateOwnedPptPrompt(brief, currentPrompt), [brief, currentPrompt])
  const selectedPageType = STATE_OWNED_PPT_PAGE_TYPES.find((item) => item.value === brief.pageType)
  const guidanceIssues = validateStateOwnedPptBrief(brief).filter((issue) => !issue.startsWith('请填写'))

  if (!open) return null

  const updateField = <K extends keyof StateOwnedPptBrief>(key: K, value: StateOwnedPptBrief[K]) => {
    setBrief((current) => ({ ...current, [key]: value }))
    setError('')
  }

  const handleApply = () => {
    const requiredIssues = validateStateOwnedPptBrief(brief).filter((issue) => issue.startsWith('请填写'))
    if (requiredIssues.length > 0) {
      setError(requiredIssues.join('；'))
      return
    }
    onApply(preview)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="国企汇报 PPT 结构卡"
        className="flex max-h-[94dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-4xl sm:rounded-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">国企汇报 PPT 结构卡</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">把业务材料整理为可直接生成的单页汇报提示词</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="rounded-xl border border-red-100 bg-red-50/70 p-3 dark:border-red-500/15 dark:bg-red-500/[0.06]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-red-700 dark:text-red-300">国企汇报规范</div>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">默认 16:9 横版、正式克制、数据忠实；未填写内容不会被系统自行编造。</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">{completion.percentage}%</div>
                <div className="text-[10px] text-gray-400">信息完整度</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-red-100 dark:bg-red-500/15">
              <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${completion.percentage}%` }} />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{field.label}{(field.key === 'topic' || field.key === 'audience') && <span className="ml-1 text-red-500">*</span>}</span>
                <textarea
                  value={brief[field.key]}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  rows={field.key === 'topic' || field.key === 'audience' ? 2 : 3}
                  className="mt-1 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">页面类型</span>
              <select
                value={brief.pageType}
                onChange={(event) => updateField('pageType', event.target.value as StateOwnedPptBrief['pageType'])}
                className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100"
              >
                {STATE_OWNED_PPT_PAGE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">{selectedPageType?.description}</p>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">画面比例</span>
                <select value={brief.aspectRatio} onChange={(event) => updateField('aspectRatio', event.target.value as StateOwnedPptBrief['aspectRatio']) className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100">
                  <option value="16:9">16:9 横版</option>
                  <option value="4:3">4:3 横版</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌色方向</span>
                <input value={brief.brandColor} onChange={(event) => updateField('brandColor', event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100" />
              </label>
            </div>
          </div>

          {guidanceIssues.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              填写建议：{guidanceIssues.join('；')}
            </div>
          )}
          {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

          <div className="mt-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">生成提示词预览</div>
            <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs leading-relaxed text-gray-700 dark:border-blue-500/20 dark:bg-blue-500/[0.06] dark:text-gray-200">
              {preview}
            </div>
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-white/[0.08]">
          <button type="button" onClick={onClose} className="min-h-12 rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200">取消</button>
          <button type="button" onClick={handleApply} className="min-h-12 rounded-xl bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">套用结构卡</button>
        </footer>
      </section>
    </div>
  )
}
