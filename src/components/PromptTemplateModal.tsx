import { useEffect, useMemo, useState } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  getAllPromptTemplates,
  getPromptTemplateDefaults,
  renderPromptTemplate,
  saveCustomPromptTemplate,
  deleteCustomPromptTemplate,
  type PromptTemplate,
  type PromptTemplateCategory,
} from '../lib/promptTemplates'

interface PromptTemplateModalProps {
  open: boolean
  currentPrompt: string
  onClose: () => void
  onApply: (prompt: string) => void
}

const CATEGORIES: Array<{ value: PromptTemplateCategory | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'poster', label: '海报' },
  { value: 'ecommerce', label: '电商' },
  { value: 'portrait', label: '人物' },
  { value: 'logo', label: 'Logo' },
  { value: 'infographic', label: '信息图' },
  { value: 'ppt-report', label: '汇报 PPT' },
  { value: 'custom', label: '我的模板' },
]

export default function PromptTemplateModal({ open, currentPrompt, onClose, onApply }: PromptTemplateModalProps) {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [category, setCategory] = useState<PromptTemplateCategory | 'all'>('all')
  const [selectedId, setSelectedId] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [customTitle, setCustomTitle] = useState('')

  useCloseOnEscape(open, onClose)
  usePreventBackgroundScroll(open)

  const refreshTemplates = () => {
    const next = getAllPromptTemplates()
    setTemplates(next)
    setSelectedId((current) => next.some((template) => template.id === current) ? current : next[0]?.id ?? '')
  }

  useEffect(() => {
    if (!open) return
    refreshTemplates()
    setCategory('all')
    setError('')
    setIsSaving(false)
    setCustomTitle('')
  }, [open])

  const visibleTemplates = useMemo(
    () => templates.filter((template) => category === 'all' || template.category === category),
    [category, templates],
  )
  const selected = templates.find((template) => template.id === selectedId) ?? null
  const renderedPrompt = selected ? renderPromptTemplate(selected, values) : ''

  useEffect(() => {
    if (!selected) return
    setValues(getPromptTemplateDefaults(selected))
    setError('')
  }, [selectedId, selected])

  if (!open) return null

  const handleApply = () => {
    if (!selected) return
    if (/{{\s*[\w-]+\s*}}/.test(renderedPrompt)) {
      setError('请先填写全部变量，再应用模板')
      return
    }
    onApply(renderedPrompt)
    onClose()
  }

  const handleSaveCurrent = () => {
    if (!currentPrompt.trim()) {
      setError('当前没有可保存的提示词')
      return
    }
    saveCustomPromptTemplate({
      title: customTitle.trim() || `我的模板 ${new Date().toLocaleDateString()}`,
      template: currentPrompt,
      description: '从当前提示词保存的本机模板',
      tags: ['自定义'],
    })
    setIsSaving(false)
    setCustomTitle('')
    setError('')
    refreshTemplates()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="专业提示词模板"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-5xl sm:rounded-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">专业提示词模板</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">选择模板，填写变量，确认后套用到当前输入</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex gap-1.5 overflow-x-auto border-b border-gray-100 px-5 py-3 dark:border-white/[0.08]">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setCategory(item.value)}
                className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-medium transition ${
                  category === item.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 md:grid-cols-[310px_1fr]">
            <div className="max-h-56 overflow-y-auto border-b border-gray-100 p-3 md:max-h-none md:border-b-0 md:border-r dark:border-white/[0.08]">
              <div className="space-y-2">
                {visibleTemplates.map((template) => (
                  <div key={template.id} className={`rounded-xl border p-2.5 transition ${
                    template.id === selectedId
                      ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-100 dark:border-white/[0.06]'
                  }`}>
                    <div className="flex items-center justify-between gap-2">
                      <button type="button" onClick={() => setSelectedId(template.id)} className="min-w-0 text-left text-sm font-medium text-gray-800 dark:text-gray-100">
                        {template.title}
                      </button>
                      {template.builtin ? <span className="text-[10px] text-gray-400">内置</span> : (
                        <button
                          type="button"
                          onClick={() => {
                            deleteCustomPromptTemplate(template.id)
                            refreshTemplates()
                          }}
                          className="text-[10px] text-red-500"
                        >
                          删除
                        </button>
                      )}
                    </div>
                    <button type="button" onClick={() => setSelectedId(template.id)} className="mt-1.5 w-full text-left">
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{template.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {template.tags.map((tag) => <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.07] dark:text-gray-400">{tag}</span>)}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {selected ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{selected.title}</h3>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{selected.description}</p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">{selected.variables.length} 个变量</span>
                  </div>

                  {selected.variables.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {selected.variables.map((variable) => (
                        <label key={variable.key} className="block">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{variable.label}</span>
                          <input
                            value={values[variable.key] ?? ''}
                            onChange={(event) => setValues((current) => ({ ...current, [variable.key]: event.target.value }))}
                            placeholder={variable.placeholder}
                            className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100"
                          />
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">实时预览</div>
                    <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm leading-relaxed text-gray-800 dark:border-blue-500/20 dark:bg-blue-500/[0.06] dark:text-gray-100">
                      {renderedPrompt}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-52 items-center justify-center text-sm text-gray-400">当前分类暂无模板</div>
              )}

              {isSaving && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                    自定义模板名称
                    <input
                      value={customTitle}
                      onChange={(event) => setCustomTitle(event.target.value)}
                      placeholder="例如：我的联通红积分海报"
                      className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100"
                    />
                  </label>
                  <button type="button" onClick={handleSaveCurrent} className="mt-2 min-h-10 rounded-lg bg-gray-800 px-3 text-xs font-medium text-white dark:bg-white dark:text-gray-900">保存到我的模板</button>
                </div>
              )}

              {error && <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 dark:border-white/[0.08]">
          <button type="button" onClick={() => setIsSaving((current) => !current)} disabled={!currentPrompt.trim()} className="min-h-10 rounded-lg px-3 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/[0.06]">
            {isSaving ? '取消保存' : '保存当前为模板'}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-gray-100 px-4 text-xs font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200">取消</button>
            <button type="button" onClick={handleApply} disabled={!selected} className="min-h-11 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white disabled:opacity-40">应用模板</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
