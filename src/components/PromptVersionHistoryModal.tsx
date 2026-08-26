import { useEffect, useMemo, useState } from 'react'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  clearPromptVersions,
  getPromptVersionDiff,
  loadPromptVersions,
  PROMPT_VERSIONS_CHANGED_EVENT,
  removePromptVersion,
  savePromptVersion,
  type PromptVersion,
} from '../lib/promptVersionHistory'

interface PromptVersionHistoryModalProps {
  open: boolean
  onClose: () => void
  onRestore: (prompt: string) => void
}

const SOURCE_LABEL: Record<PromptVersion['source'], string> = {
  original: '原始',
  enhanced: '增强',
  generated: '生成',
  restored: '回退',
  template: '模板',
}

export default function PromptVersionHistoryModal({ open, onClose, onRestore }: PromptVersionHistoryModalProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [selectedId, setSelectedId] = useState('')

  useCloseOnEscape(open, onClose)
  usePreventBackgroundScroll(open)

  const refresh = () => {
    const next = loadPromptVersions()
    setVersions(next)
    setSelectedId((current) => next.some((version) => version.id === current) ? current : next[0]?.id ?? '')
  }

  useEffect(() => {
    if (!open) return
    refresh()
    window.addEventListener(PROMPT_VERSIONS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(PROMPT_VERSIONS_CHANGED_EVENT, refresh)
  }, [open])

  const selectedIndex = versions.findIndex((version) => version.id === selectedId)
  const selected = selectedIndex >= 0 ? versions[selectedIndex] : null
  const previous = selectedIndex >= 0 ? versions[selectedIndex + 1] ?? null : null
  const diff = useMemo(
    () => selected ? getPromptVersionDiff(previous?.prompt ?? '', selected.prompt) : null,
    [previous?.prompt, selected],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/35 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="提示词版本"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:max-w-4xl sm:rounded-2xl dark:bg-gray-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">提示词版本</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">原始、增强、生成和回退版本均保存在本机</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
        </header>

        {versions.length === 0 ? (
          <div className="flex min-h-60 items-center justify-center px-6 text-center text-sm text-gray-400">
            使用“智能优化提示词”或提交生成后，版本会自动出现在这里
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
            <div className="max-h-64 overflow-y-auto border-b border-gray-100 p-3 md:max-h-none md:border-b-0 md:border-r dark:border-white/[0.08]">
              <div className="space-y-2">
                {versions.map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    onClick={() => setSelectedId(version.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                      version.id === selectedId
                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                        : 'border-gray-100 hover:bg-gray-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">
                        {SOURCE_LABEL[version.source]}{version.enhancementLevel ? ` · ${version.enhancementLevel}` : ''}
                      </span>
                      <time className="text-[10px] text-gray-400">{new Date(version.createdAt).toLocaleString()}</time>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-700 dark:text-gray-200">{version.prompt}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 overflow-y-auto px-5 py-4">
              {selected && diff && (
                <>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    与上一个版本对比{previous ? '' : ' · 首个版本'}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100">
                    <span>{diff.prefix}</span>
                    {diff.removed && <span className="bg-red-100 text-red-700 line-through dark:bg-red-500/20 dark:text-red-300">{diff.removed}</span>}
                    {diff.added && <span className="bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300">{diff.added}</span>}
                    <span>{diff.suffix}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        savePromptVersion({ prompt: selected.prompt, source: 'restored' })
                        onRestore(selected.prompt)
                        onClose()
                      }}
                      className="min-h-11 rounded-xl bg-blue-600 px-3 text-xs font-medium text-white"
                    >
                      回退到此版本
                    </button>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(selected.prompt)}
                      className="min-h-11 rounded-xl bg-gray-100 px-3 text-xs font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200"
                    >
                      复制
                    </button>
                    <button
                      type="button"
                      onClick={() => removePromptVersion(selected.id)}
                      className="min-h-11 rounded-xl bg-red-50 px-3 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300"
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {versions.length > 0 && (
          <footer className="border-t border-gray-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-right dark:border-white/[0.08]">
            <button type="button" onClick={clearPromptVersions} className="min-h-10 rounded-lg px-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
              清空全部版本
            </button>
          </footer>
        )}
      </section>
    </div>
  )
}
