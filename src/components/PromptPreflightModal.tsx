import { useEffect } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import type { PromptPreflightResult } from '../lib/promptPreflight'

interface PromptPreflightModalProps {
  open: boolean
  result: PromptPreflightResult | null
  onCancel: () => void
  onConfirm: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  ratio: '比例',
  references: '参考图',
  conflict: '冲突',
  text: '文字',
  format: '格式',
  provider: '服务商',
}

export default function PromptPreflightModal({ open, result, onCancel, onConfirm }: PromptPreflightModalProps) {
  useCloseOnEscape(open, onCancel)
  usePreventBackgroundScroll(open)

  useEffect(() => {
    if (open) document.activeElement instanceof HTMLElement && document.activeElement.blur()
  }, [open])

  if (!open || !result) return null

  const errorCount = result.issues.filter((issue) => issue.severity === 'error').length
  const warningCount = result.issues.length - errorCount

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onCancel}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="生成前质量检查"
        className="flex max-h-[88dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <header className="border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">生成前质量检查</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">本地规则检查，不调用 AI，不会产生额外费用</p>
            </div>
            <button type="button" onClick={onCancel} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
          </div>
          <div className={`mt-3 rounded-xl px-3 py-2.5 ${
            result.passed
              ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-300'
              : errorCount > 0
                ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
          }`}>
            <div className="text-sm font-semibold">
              {result.passed ? '检查通过，可直接生成' : errorCount > 0 ? `发现 ${errorCount} 项阻断风险` : `发现 ${warningCount} 项建议`}
            </div>
            {!result.passed && (
              <div className="mt-1 text-[11px] opacity-80">
                {errorCount > 0 ? '建议先返回输入框修正；确认后仍可继续提交。' : '这些建议不会阻止生成，可按需调整。'}
              </div>
            )}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <div className="space-y-2.5">
            {result.issues.map((issue, index) => (
              <div key={`${issue.category}-${issue.title}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-white/[0.07] dark:bg-white/[0.04]">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    issue.severity === 'error'
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}>
                    {issue.severity === 'error' ? '阻断' : '建议'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">
                      <span>{issue.title}</span>
                      <span className="text-[10px] font-normal text-gray-400">· {CATEGORY_LABELS[issue.category] ?? issue.category}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">{issue.description}</p>
                    <p className="mt-1 text-[11px] text-blue-600 dark:text-blue-300">建议：{issue.suggestion}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 dark:border-white/[0.08]">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-xl bg-gray-100 px-4 text-sm font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200">返回修改</button>
          <button type="button" onClick={onConfirm} className={`min-h-12 rounded-xl px-4 text-sm font-medium text-white ${
            errorCount > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}>
            {errorCount > 0 ? '忽略提示并继续' : '确认并生成'}
          </button>
        </footer>
      </section>
    </div>
  )
}
