import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import type { InputImage } from '../types'
import { getActiveAgentRounds } from '../lib/agentConversationState'
import { getAgentTextApiProfile, isAgentTextApiProfile } from '../lib/apiProfiles'
import { ensureImageCached } from '../lib/imageCache'
import { compilePromptIntent, getPromptTaskTypeLabel } from '../lib/promptCompiler'
import { resolveAgentPromptImageReferenceEntries } from '../lib/agentImageReferences'
import { getImageMentionLabel } from '../lib/promptImageMentions'
import { savePromptVersion } from '../lib/promptVersionHistory'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import PromptEnhancerModal from './PromptEnhancerModal'
import PromptTemplateModal from './PromptTemplateModal'
import PromptVersionHistoryModal from './PromptVersionHistoryModal'
import StateOwnedPptBriefModal from './StateOwnedPptBriefModal'

type PromptEnhancerReference = {
  image: InputImage
  label: string
}

type PromptStudioTool = 'enhancer' | 'templates' | 'versions' | 'ppt'

function ToolCard({
  title,
  description,
  badge,
  disabled = false,
  onClick,
}: {
  title: string
  description: string
  badge: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition dark:border-white/[0.08] dark:bg-white/[0.04] ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:hover:border-blue-400/40'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">{badge}</span>
      </div>
      <div className="mt-3 text-xs font-medium text-blue-600 transition group-hover:translate-x-0.5 dark:text-blue-300">{disabled ? '请先填写提示词' : '打开工具 →'}</div>
    </button>
  )
}

export default function PromptStudioModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prompt = useStore((s) => s.prompt)
  const setPrompt = useStore((s) => s.setPrompt)
  const appMode = useStore((s) => s.appMode)
  const settings = useStore((s) => s.settings)
  const inputImages = useStore((s) => s.inputImages)
  const tasks = useStore((s) => s.tasks)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const showToast = useStore((s) => s.showToast)
  const [activeTool, setActiveTool] = useState<PromptStudioTool | null>(null)
  const [agentPromptReferenceImages, setAgentPromptReferenceImages] = useState<PromptEnhancerReference[]>([])
  const [agentPromptReferenceLoading, setAgentPromptReferenceLoading] = useState(false)

  const activeAgentConversation = appMode === 'agent'
    ? agentConversations.find((conversation) => conversation.id === activeAgentConversationId) ?? null
    : null
  const agentPromptReferenceEntries = useMemo(() => {
    if (!activeAgentConversation) return []
    return resolveAgentPromptImageReferenceEntries(
      prompt,
      getActiveAgentRounds(activeAgentConversation),
      tasks,
    )
  }, [activeAgentConversation, prompt, tasks])

  useEffect(() => {
    let cancelled = false
    if (!open || activeTool !== 'enhancer' || agentPromptReferenceEntries.length === 0) {
      setAgentPromptReferenceImages([])
      setAgentPromptReferenceLoading(false)
      return
    }

    setAgentPromptReferenceLoading(true)
    const loadReferences = async () => {
      try {
        const loaded = await Promise.all(agentPromptReferenceEntries.map(async ({ imageId, label }) => {
          const dataUrl = await ensureImageCached(imageId)
          return dataUrl ? { image: { id: imageId, dataUrl }, label } : null
        }))
        if (!cancelled) setAgentPromptReferenceImages(loaded.filter((entry): entry is PromptEnhancerReference => Boolean(entry)))
      } catch {
        if (!cancelled) setAgentPromptReferenceImages([])
      } finally {
        if (!cancelled) setAgentPromptReferenceLoading(false)
      }
    }

    void loadReferences()
    return () => {
      cancelled = true
    }
  }, [activeTool, agentPromptReferenceEntries, open])

  const promptEnhancerReferenceEntries = useMemo(() => {
    const merged = new Map<string, PromptEnhancerReference>()
    const addReference = (image: InputImage, label: string) => {
      const existing = merged.get(image.id)
      if (!existing) {
        merged.set(image.id, { image, label })
        return
      }
      const labels = existing.label.split('、')
      if (!labels.includes(label)) existing.label = labels.concat(label).join('、')
    }

    inputImages.forEach((image, index) => addReference(image, getImageMentionLabel(index)))
    agentPromptReferenceImages.forEach(({ image, label }) => addReference(image, label))
    return Array.from(merged.values())
  }, [agentPromptReferenceImages, inputImages])

  const promptEnhancerProfile = useMemo(() => {
    const profile = getAgentTextApiProfile(settings)
    return profile && isAgentTextApiProfile(profile) ? profile : null
  }, [settings])
  const detectedIntent = useMemo(() => compilePromptIntent(prompt), [prompt])

  useCloseOnEscape(open && activeTool === null, onClose)
  usePreventBackgroundScroll(open)

  useEffect(() => {
    if (!open) setActiveTool(null)
  }, [open])

  if (!open) return null

  const applyPrompt = (nextPrompt: string) => {
    savePromptVersion({ prompt: nextPrompt, source: 'template' })
    setPrompt(nextPrompt)
    setActiveTool(null)
    showToast('已应用提示词，可继续修改或生成', 'success')
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-5" onClick={onClose}>
        <section
          role="dialog"
          aria-modal="true"
          aria-label="提示词工作室"
          data-prompt-studio
          className="flex h-[min(94dvh,900px)] w-full flex-col overflow-hidden rounded-t-[28px] bg-gray-50 shadow-2xl dark:bg-gray-950 sm:max-w-5xl sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-gray-300 sm:hidden dark:bg-gray-600" />
          <header className="flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-4 backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/90">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-300">Prompt studio</div>
              <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">提示词工作室</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">集中管理增强、模板、版本和国企汇报结构，应用前仍由你确认。</p>
            </div>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-2xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/[0.08]" aria-label="关闭">×</button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 dark:border-blue-500/15 dark:from-blue-500/[0.1] dark:to-white/[0.03]">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">当前任务类型：{getPromptTaskTypeLabel(detectedIntent.taskType)}</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">参考图 {promptEnhancerReferenceEntries.length} 张</span>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-gray-500 dark:bg-white/[0.07] dark:text-gray-300">提交时自动预检</span>
              </div>
              <div className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-blue-100 bg-white/80 p-3 text-sm leading-relaxed text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200">
                {prompt.trim() || '当前还没有提示词，请从 Gallery 或 Agent 输入栏开始。'}
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ToolCard title="智能增强" description="三档增强、任务类型识别、参考图感知和前后对比。" badge="手动调用" disabled={!prompt.trim()} onClick={() => setActiveTool('enhancer')} />
              <ToolCard title="专业模板库" description="海报、电商、人物、Logo、信息图和国企汇报 PPT。" badge="本机模板" onClick={() => setActiveTool('templates')} />
              <ToolCard title="版本历史" description="查看差异、复制版本、回退并保留新的历史记录。" badge="最多 50 条" onClick={() => setActiveTool('versions')} />
              <ToolCard title="国企汇报 PPT 结构卡" description="按主题、背景、问题、目标、举措、数据和结论组织单页材料。" badge="16:9" onClick={() => setActiveTool('ppt')} />
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
              <div className="text-sm font-semibold text-gray-900 dark:text-white">使用边界</div>
              <div className="mt-2 grid gap-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400 sm:grid-cols-3">
                <div>增强和参考图分析仅在你点击后调用。</div>
                <div>版本、模板和结构卡套用不调用 AI。</div>
                <div>结果应用前保留原提示词，可继续修改。</div>
              </div>
            </div>
          </div>

          <footer className="border-t border-gray-200 bg-white/90 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-right dark:border-white/[0.08] dark:bg-gray-900/90">
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-gray-100 px-5 text-xs font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200">返回当前输入</button>
          </footer>
        </section>
      </div>

      <PromptEnhancerModal
        open={activeTool === 'enhancer'}
        prompt={prompt}
        profile={promptEnhancerProfile}
        referenceImages={promptEnhancerReferenceEntries.map(({ image }) => image)}
        referenceImageLabels={promptEnhancerReferenceEntries.map(({ label }) => label)}
        referenceImagesLoading={agentPromptReferenceLoading}
        onClose={() => setActiveTool(null)}
        onApply={(nextPrompt) => {
          setPrompt(nextPrompt)
          setActiveTool(null)
          showToast('已应用增强提示词，可继续修改或直接生成', 'success')
        }}
      />
      <PromptTemplateModal
        open={activeTool === 'templates'}
        currentPrompt={prompt}
        onClose={() => setActiveTool(null)}
        onApply={(nextPrompt) => applyPrompt(nextPrompt)}
      />
      <PromptVersionHistoryModal
        open={activeTool === 'versions'}
        onClose={() => setActiveTool(null)}
        onRestore={(nextPrompt) => {
          setPrompt(nextPrompt)
          setActiveTool(null)
          showToast('已回退到所选提示词版本', 'success')
        }}
      />
      <StateOwnedPptBriefModal
        open={activeTool === 'ppt'}
        currentPrompt={prompt}
        onClose={() => setActiveTool(null)}
        onApply={(nextPrompt) => applyPrompt(nextPrompt)}
      />
    </>
  )
}
