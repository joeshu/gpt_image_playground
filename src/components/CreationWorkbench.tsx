import { useEffect, useMemo, useRef, useState } from 'react'
import { getImage } from '../lib/db'
import {
  CREATION_ASPECT_RATIOS,
  MAX_CREATION_PROJECTS,
  MAX_CREATION_VARIABLES,
  buildCreationPrompt,
  createCreationProject,
  exportCreationProject,
  getActiveCreationProject,
  getCreationBatchCombinationCount,
  getCreationProjectCompletion,
  loadCreationWorkspace,
  parseCreationProjectExport,
  removeCreationProject,
  saveCreationWorkspace,
} from '../lib/creationWorkspace'
import { savePromptVersion } from '../lib/promptVersionHistory'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { useStore } from '../store'
import type { CreationProject, CreationWorkspaceModule, CreationVariable } from '../types'
import CreationBatchPanel from './CreationBatchPanel'
import { PlusIcon } from './icons'

const MODULES: Array<{ value: CreationWorkspaceModule; label: string; description: string }> = [
  { value: 'overview', label: '项目总览', description: '查看当前项目的规则完整度与下一步动作' },
  { value: 'prompt', label: '提示词工作室', description: '集中管理增强、模板、版本和国企汇报结构' },
  { value: 'brand', label: '品牌资产', description: '统一品牌名称、色彩和视觉资产说明' },
  { value: 'style', label: '风格锁定', description: '固定系列图片需要保持的视觉规则' },
  { value: 'series', label: '系列与批量', description: '建立跨图一致性与批量变量组合' },
]

const fieldClass = 'mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm leading-relaxed text-gray-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/10'
const smallFieldClass = 'min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100'

function getModule(value: CreationWorkspaceModule) {
  return MODULES.find((item) => item.value === value) ?? MODULES[0]
}

function updateProjectInState(
  project: CreationProject,
  projects: CreationProject[],
  patch: Partial<CreationProject>,
) {
  return projects.map((item) => item.id === project.id ? { ...item, ...patch, updatedAt: Date.now() } : item)
}

function updateNestedProject(
  project: CreationProject,
  projects: CreationProject[],
  patch: Partial<CreationProject>,
) {
  return updateProjectInState(project, projects, patch)
}

function ProjectProgress({ project }: { project: CreationProject }) {
  const completion = getCreationProjectCompletion(project)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-gray-500 dark:text-gray-400">规则完整度</span>
        <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-300">{completion}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-500/15">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${completion}%` }} />
      </div>
    </div>
  )
}

function ModuleCard({
  title,
  description,
  onClick,
  children,
}: {
  title: string
  description: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} className="group min-w-0 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md dark:border-white/[0.08] dark:bg-white/[0.04] dark:hover:border-blue-400/40">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
          <div className="mt-1 break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</div>
        </div>
        <span className="shrink-0 text-lg text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500">→</span>
      </div>
      <div className="mt-3">{children}</div>
    </button>
  )
}

interface CreationWorkbenchProps {
  onClose: () => void
  onOpenPromptStudio?: () => void
  onPromptApplied?: () => void
  onBatchBusyChange?: (busy: boolean) => void
  /** 工作台离开当前一级页面时保持挂载，避免批量队列 runner 被卸载。 */
  visible?: boolean
}

export default function CreationWorkbench({ onClose, onOpenPromptStudio, onPromptApplied, onBatchBusyChange, visible = true }: CreationWorkbenchProps) {
  const currentPrompt = useStore((state) => state.prompt)
  const inputImages = useStore((state) => state.inputImages)
  const showToast = useStore((state) => state.showToast)
  const setPrompt = useStore((state) => state.setPrompt)
  const setConfirmDialog = useStore((state) => state.setConfirmDialog)
  const [workspace, setWorkspace] = useState(() => loadCreationWorkspace())
  const [activeModule, setActiveModule] = useState<CreationWorkspaceModule>('overview')
  const [batchBusy, setBatchBusy] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const activeProject = useMemo(() => getActiveCreationProject(workspace), [workspace])
  const activeModuleInfo = getModule(activeModule)

  const requestClose = () => {
    if (batchBusy) {
      showToast('批量生成进行中，请先暂停或等待当前任务完成', 'info')
      return
    }
    onClose()
  }

  useCloseOnEscape(visible, requestClose)

  useEffect(() => {
    if (!visible) return
    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const frame = window.requestAnimationFrame(() => {
      scrollToTop()
      window.requestAnimationFrame(scrollToTop)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [visible])

  useEffect(() => {
    saveCreationWorkspace(workspace)
  }, [workspace])

  if (!activeProject) return null

  const updateActiveProject = (patch: Partial<CreationProject>) => {
    setWorkspace((current) => {
      const project = getActiveCreationProject(current)
      if (!project) return current
      return { ...current, projects: updateProjectInState(project, current.projects, patch) }
    })
  }

  const updateBrand = (patch: Partial<CreationProject['brand']>) => {
    setWorkspace((current) => {
      const project = getActiveCreationProject(current)
      if (!project) return current
      return {
        ...current,
        projects: updateNestedProject(project, current.projects, { brand: { ...project.brand, ...patch } }),
      }
    })
  }

  const updateStyle = (patch: Partial<CreationProject['style']>) => {
    setWorkspace((current) => {
      const project = getActiveCreationProject(current)
      if (!project) return current
      return {
        ...current,
        projects: updateNestedProject(project, current.projects, { style: { ...project.style, ...patch } }),
      }
    })
  }

  const updateSeries = (patch: Partial<CreationProject['series']>) => {
    setWorkspace((current) => {
      const project = getActiveCreationProject(current)
      if (!project) return current
      return {
        ...current,
        projects: updateNestedProject(project, current.projects, { series: { ...project.series, ...patch } }),
      }
    })
  }

  const handleBatchBusyChange = (busy: boolean) => {
    setBatchBusy(busy)
    onBatchBusyChange?.(busy)
  }

  const handleOpenPromptStudio = () => {
    if (batchBusy) {
      showToast('批量生成进行中，暂不能修改当前提示词', 'info')
      return
    }
    onOpenPromptStudio?.()
  }

  const handleNewProject = () => {
    if (workspace.projects.length >= MAX_CREATION_PROJECTS) {
      showToast(`最多保存 ${MAX_CREATION_PROJECTS} 个创作项目`, 'info')
      return
    }
    const project = createCreationProject(`新创作项目 ${workspace.projects.length + 1}`)
    setWorkspace((current) => ({
      projects: [project, ...current.projects],
      activeProjectId: project.id,
    }))
    setActiveModule('overview')
  }

  const handleExportProject = () => {
    const blob = new Blob([exportCreationProject(activeProject)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${activeProject.name || '创作项目'}-工作台配置.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    showToast('项目配置已导出', 'success')
  }

  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (workspace.projects.length >= MAX_CREATION_PROJECTS) {
      showToast(`最多保存 ${MAX_CREATION_PROJECTS} 个创作项目，请先删除一个项目`, 'info')
      return
    }
    try {
      const imported = parseCreationProjectExport(await file.text())
      if (!imported) {
        showToast('项目配置文件无效或已损坏', 'error')
        return
      }
      const now = Date.now()
      const shell = createCreationProject(imported.name || '导入项目', now)
      const project = { ...imported, id: shell.id, createdAt: now, updatedAt: now }
      setWorkspace((current) => ({
        projects: [project, ...current.projects].slice(0, MAX_CREATION_PROJECTS),
        activeProjectId: project.id,
      }))
      setActiveModule('overview')
      showToast(`已导入项目「${project.name}」`, 'success')
    } catch (error) {
      console.warn('Failed to import creation project:', error)
      showToast('项目配置文件读取失败', 'error')
    }
  }

  const handleDeleteProject = () => {
    if (workspace.projects.length <= 1) {
      showToast('至少保留一个创作项目', 'info')
      return
    }
    setConfirmDialog({
      title: '删除创作项目',
      message: `确定删除「${activeProject.name}」吗？项目中的品牌、风格和系列规则会一并移除。`,
      confirmText: '删除项目',
      cancelText: '取消',
      tone: 'danger',
      action: () => {
        setWorkspace((current) => removeCreationProject(current, activeProject.id))
        showToast('创作项目已删除', 'success')
      },
    })
  }

  const handleBindCurrentImages = () => {
    if (inputImages.length === 0) {
      showToast('当前输入栏还没有参考图', 'info')
      return
    }
    updateBrand({ referenceImageIds: inputImages.map((image) => image.id) })
    showToast(`已绑定当前 ${inputImages.length} 张参考图`, 'success')
  }

  const handleApplyToPrompt = async () => {
    if (batchBusy) {
      showToast('批量生成进行中，请先暂停或等待当前任务完成', 'info')
      return
    }
    const missingIds = activeProject.brand.referenceImageIds.filter((id) => !useStore.getState().inputImages.some((image) => image.id === id))
    let additions: Array<{ id: string; dataUrl: string }> = []
    try {
      const loadedImages = await Promise.all(missingIds.map(async (id) => {
        const image = await getImage(id)
        return image?.dataUrl ? { id: image.id, dataUrl: image.dataUrl } : null
      }))
      additions = loadedImages.filter((image): image is { id: string; dataUrl: string } => image != null)
    } catch (error) {
      console.warn('Failed to restore creation workspace reference images:', error)
      showToast('品牌参考图读取失败，仍将应用文字规则', 'info')
    }
    if (additions.length > 0) {
      const currentImages = useStore.getState().inputImages
      const existingIds = new Set(currentImages.map((image) => image.id))
      useStore.getState().setInputImages([...currentImages, ...additions.filter((image) => !existingIds.has(image.id))])
    }

    const prompt = buildCreationPrompt(activeProject, currentPrompt)
    savePromptVersion({ prompt, source: 'template' })
    setPrompt(prompt)
    onPromptApplied?.()
    requestClose()
    showToast('已将创作规则应用到当前提示词', 'success')
  }

  const updateVariable = (id: string, patch: Partial<CreationVariable>) => {
    updateSeries({ variables: activeProject.series.variables.map((variable) => variable.id === id ? { ...variable, ...patch } : variable) })
  }

  const addVariable = () => {
    if (activeProject.series.variables.length >= MAX_CREATION_VARIABLES) {
      showToast(`批量变量最多 ${MAX_CREATION_VARIABLES} 个`, 'info')
      return
    }
    const variable: CreationVariable = {
      id: `variable-${Date.now().toString(36)}`,
      name: `变量${activeProject.series.variables.length + 1}`,
      values: [],
    }
    updateSeries({ variables: [...activeProject.series.variables, variable] })
  }

  const removeVariable = (id: string) => {
    updateSeries({ variables: activeProject.series.variables.filter((variable) => variable.id !== id) })
  }

  return (
    <main data-creation-workbench aria-hidden={!visible} className={`${visible ? '' : 'hidden'} min-h-[100svh] w-full min-w-0 overflow-x-clip bg-gray-50 pb-8 dark:bg-gray-950`}>
      <div data-creation-content className="safe-area-x mx-auto w-full min-w-0 max-w-7xl px-0 pt-4 sm:pt-6">
        <div className="flex min-w-0 w-full max-w-full flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={requestClose} className="mb-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-500 transition hover:bg-white hover:text-gray-800 dark:hover:bg-white/[0.06] dark:hover:text-gray-200">
              <span aria-hidden="true">←</span>
              返回生成
            </button>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">Advanced creation</span>
              <span className="text-xs text-gray-400">本机工作区</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-3xl">创作工作台</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">将品牌、风格、系列和批量规则集中管理，再一次性应用到画廊或 Agent 的当前提示词。</p>
          </div>

          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <select
              value={activeProject.id}
              onChange={(event) => setWorkspace((current) => ({ ...current, activeProjectId: event.target.value }))}
              className="min-h-11 min-w-[12rem] rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none focus:border-blue-400 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-gray-100"
              aria-label="当前创作项目"
            >
              {workspace.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button type="button" onClick={handleNewProject} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 text-xs font-medium text-white transition hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200">
              <PlusIcon className="h-4 w-4" />
              新建项目
            </button>
            <button type="button" onClick={handleExportProject} className="min-h-11 rounded-xl border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06]">导出配置</button>
            <button type="button" onClick={() => importInputRef.current?.click()} className="min-h-11 rounded-xl border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-white/[0.1] dark:text-gray-300 dark:hover:bg-white/[0.06]">导入配置</button>
            <input ref={importInputRef} type="file" accept="application/json,.json" onChange={(event) => void handleImportProject(event)} className="hidden" aria-label="导入创作项目配置" />
          </div>
        </div>

        <div data-creation-layout className="mt-6 grid min-w-0 w-full max-w-full gap-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
          <aside className="min-w-0 w-full max-w-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
            <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400">项目导航</div>
            <div className="flex min-w-0 max-w-full gap-1.5 touch-pan-x overscroll-x-contain overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] lg:block lg:space-y-1 lg:overflow-visible">
              {MODULES.map((item) => (
                <button key={item.value} type="button" onClick={() => setActiveModule(item.value)} className={`min-w-[7.5rem] rounded-xl px-3 py-2.5 text-left transition lg:block lg:w-full ${activeModule === item.value ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]'}`}>
                  <div className="text-xs font-semibold">{item.label}</div>
                  <div className="mt-0.5 hidden text-[10px] leading-relaxed text-gray-400 lg:block">{item.description}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 hidden border-t border-gray-100 pt-4 lg:block dark:border-white/[0.08]">
              <div className="px-2 text-[10px] text-gray-400">项目数量</div>
              <div className="mt-1 px-2 text-sm font-semibold text-gray-800 dark:text-gray-200">{workspace.projects.length} / {MAX_CREATION_PROJECTS}</div>
            </div>
          </aside>

          <section className="min-w-0 w-full max-w-full">
            <div className="mb-4 flex min-w-0 w-full max-w-full flex-col gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm dark:border-blue-500/15 dark:from-blue-500/[0.1] dark:to-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-300">当前项目</div>
                <div className="mt-1 flex items-center gap-2">
                  <input value={activeProject.name} onChange={(event) => updateActiveProject({ name: event.target.value })} className="min-w-0 max-w-full border-0 bg-transparent p-0 text-lg font-semibold text-gray-900 outline-none focus:ring-0 dark:text-white" aria-label="项目名称" />
                  <button type="button" onClick={handleDeleteProject} className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">删除</button>
                </div>
                <input value={activeProject.description} onChange={(event) => updateActiveProject({ description: event.target.value })} placeholder="补充项目用途，例如：2026 年度品牌宣传素材" className="mt-1 w-full max-w-xl border-0 bg-transparent p-0 text-xs text-gray-500 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-gray-400" aria-label="项目说明" />
              </div>
              <div className="w-full shrink-0 sm:w-48"><ProjectProgress project={activeProject} /></div>
            </div>

            <div className="mb-4 flex min-w-0 w-full max-w-full items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{activeModuleInfo.label}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{activeModuleInfo.description}</p>
              </div>
              <button type="button" onClick={() => void handleApplyToPrompt()} className="hidden min-h-10 shrink-0 rounded-xl bg-blue-600 px-3.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 sm:inline-flex sm:items-center">应用到当前提示词</button>
            </div>

            {activeModule === 'overview' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <ModuleCard title="品牌资产中心" description="先定义品牌事实和色彩，再在每次创作中复用。" onClick={() => setActiveModule('brand')}>
                    <div className="flex items-center gap-2">
                      {[activeProject.brand.primaryColor, activeProject.brand.secondaryColor, activeProject.brand.neutralColor].map((color) => <span key={color} className="h-7 w-7 rounded-full border border-white shadow-sm dark:border-gray-800" style={{ backgroundColor: color }} />)}
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">{activeProject.brand.referenceImageIds.length} 张参考图</span>
                    </div>
                  </ModuleCard>
                  <ModuleCard title="提示词工作室" description="将增强、模板、版本和国企汇报结构卡集中到一个创作入口。" onClick={() => setActiveModule('prompt')}>
                    <div className="text-xs text-gray-600 dark:text-gray-300">当前任务类型与输入提示词联动</div>
                  </ModuleCard>
                  <ModuleCard title="风格锁定" description="把视觉方向、版式和禁用项固定为项目级规则。" onClick={() => setActiveModule('style')}>
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-1 ${activeProject.style.enabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.06]'}`}>{activeProject.style.enabled ? '已启用' : '未启用'}</span>
                      <span className="truncate text-gray-500 dark:text-gray-400">{activeProject.style.visualDirection || '尚未填写视觉方向'}</span>
                    </div>
                  </ModuleCard>
                  <ModuleCard title="系列一致性" description="锁定主体、比例和跨图规则，减少系列素材漂移。" onClick={() => setActiveModule('series')}>
                    <div className="text-xs text-gray-600 dark:text-gray-300">{activeProject.series.name || '尚未命名系列'} · {activeProject.series.aspectRatio}</div>
                  </ModuleCard>
                  <ModuleCard title="批量变量" description="预览组合后手动启动队列，失败停在当前项并支持重试。" onClick={() => setActiveModule('series')}>
                    <div className="text-xs text-gray-600 dark:text-gray-300">{activeProject.series.variables.length} 个变量 · {getCreationBatchCombinationCount(activeProject)} 个组合</div>
                  </ModuleCard>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">当前提示词联动</div>
                      <p className="mt-1 break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">应用时会保留现有提示词，把本项目规则追加到末尾，并写入提示词版本历史。</p>
                    </div>
                    <button type="button" onClick={() => void handleApplyToPrompt()} className="min-h-11 w-full shrink-0 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 sm:w-auto">应用规则</button>
                  </div>
                </div>
              </div>
            )}

            {activeModule === 'prompt' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
                  <div className="text-sm font-semibold text-blue-800 dark:text-blue-200">提示词工作室</div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-300">在这里进入统一的提示词工具入口；Gallery 与 Agent 输入栏仍保留快捷入口，避免打断快速创作。</p>
                  <button type="button" onClick={handleOpenPromptStudio} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white shadow-sm hover:bg-blue-700">打开提示词工作室</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="text-sm font-semibold text-gray-900 dark:text-white">项目规则</div><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">品牌与风格规则仍由当前项目控制，应用提示词时会写入版本历史。</p></div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.08] dark:bg-white/[0.04]"><div className="text-sm font-semibold text-gray-900 dark:text-white">生成前预检</div><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">提交生成时自动检查比例、参考图、文字密度和格式兼容性，不增加 AI 调用。</p></div>
                </div>
              </div>
            )}

            {activeModule === 'brand' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌名称</span><input value={activeProject.brand.name} onChange={(event) => updateBrand({ name: event.target.value })} placeholder="例如：中国联通" className={smallFieldClass + ' mt-1'} /></label>
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">品牌口号 / 语气</span><input value={activeProject.brand.slogan} onChange={(event) => updateBrand({ slogan: event.target.value })} placeholder="例如：连接美好，共创未来" className={smallFieldClass + ' mt-1'} /></label>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[['primaryColor', '品牌主色'], ['secondaryColor', '辅助色'], ['neutralColor', '中性色']].map(([key, label]) => {
                    const color = activeProject.brand[key as keyof typeof activeProject.brand] as string
                    return <label key={key} className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span><div className="mt-1 flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 dark:border-white/[0.1] dark:bg-white/[0.04]"><input type="color" value={color} onChange={(event) => updateBrand({ [key]: event.target.value })} className="h-8 w-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" aria-label={label} /><input value={color} onChange={(event) => updateBrand({ [key]: event.target.value })} className="min-w-0 flex-1 border-0 bg-transparent px-1 text-sm uppercase text-gray-700 outline-none focus:ring-0 dark:text-gray-200" /></div></label>
                  })}
                </div>
                <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">视觉资产说明</span><textarea value={activeProject.brand.visualNotes} onChange={(event) => updateBrand({ visualNotes: event.target.value })} rows={5} placeholder="记录 Logo 使用方式、品牌图形、字体气质、图片中的固定元素等。只填写已经确认的品牌事实。" className={fieldClass} /></label>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/15 dark:bg-blue-500/[0.06]">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0"><div className="text-sm font-semibold text-blue-800 dark:text-blue-200">品牌参考图</div><p className="mt-1 break-words text-xs leading-relaxed text-gray-600 dark:text-gray-300">绑定当前输入栏的图片。应用规则时会尝试从本机图片库恢复它们，不会上传或调用 AI。</p></div>
                    <button type="button" onClick={handleBindCurrentImages} className="min-h-10 shrink-0 rounded-xl bg-white px-3 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50 dark:bg-white/[0.08] dark:text-blue-200">绑定当前参考图</button>
                  </div>
                  <div className="mt-3 text-xs text-blue-700 dark:text-blue-300">已绑定 {activeProject.brand.referenceImageIds.length} 张</div>
                </div>
              </div>
            )}

            {activeModule === 'style' && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <input type="checkbox" checked={activeProject.style.enabled} onChange={(event) => updateStyle({ enabled: event.target.checked })} className="mt-0.5 h-4 w-4 accent-blue-600" id="creation-style-enabled" />
                  <label htmlFor="creation-style-enabled" className="cursor-pointer"><div className="text-sm font-semibold text-gray-900 dark:text-white">启用风格锁定</div><p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">启用后，应用到提示词的规则会要求后续图片保持风格方向和版式约束。</p></label>
                </div>
                <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">视觉方向</span><textarea value={activeProject.style.visualDirection} onChange={(event) => updateStyle({ visualDirection: event.target.value })} rows={4} placeholder="例如：正式、克制、现代政企商务风；大面积留白，信息层级清晰" className={fieldClass} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">必须保持的关键词</span><textarea value={activeProject.style.keywords} onChange={(event) => updateStyle({ keywords: event.target.value })} rows={5} placeholder="用逗号或换行填写：稳重、清晰、统一、留白…" className={fieldClass} /></label>
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">避免出现</span><textarea value={activeProject.style.avoid} onChange={(event) => updateStyle({ avoid: event.target.value })} rows={5} placeholder="例如：过度炫技、廉价渐变、无关装饰、拥挤排版…" className={fieldClass} /></label>
                </div>
                <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">版式规则</span><textarea value={activeProject.style.layoutRules} onChange={(event) => updateStyle({ layoutRules: event.target.value })} rows={5} placeholder="例如：标题优先，结论突出；数据与备注分层；四周保留安全区…" className={fieldClass} /></label>
              </div>
            )}

            {activeModule === 'series' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">系列名称</span><input value={activeProject.series.name} onChange={(event) => updateSeries({ name: event.target.value })} placeholder="例如：2026 年度政企汇报视觉套件" className={smallFieldClass + ' mt-1'} /></label>
                  <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">默认比例</span><select value={activeProject.series.aspectRatio} onChange={(event) => updateSeries({ aspectRatio: event.target.value as CreationProject['series']['aspectRatio'] })} className={smallFieldClass + ' mt-1'}>{CREATION_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio === 'auto' ? '跟随当前设置' : ratio}</option>)}</select></label>
                </div>
                <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">系列主体</span><textarea value={activeProject.series.subject} onChange={(event) => updateSeries({ subject: event.target.value })} rows={4} placeholder="填写每张图都必须保持的主体、人物、商品或信息主题。" className={fieldClass} /></label>
                <label className="block"><span className="text-xs font-medium text-gray-700 dark:text-gray-200">跨图一致性规则</span><textarea value={activeProject.series.consistencyRules} onChange={(event) => updateSeries({ consistencyRules: event.target.value })} rows={4} placeholder="例如：人物身份、商品比例、品牌色、字体气质、镜头语言和背景系统保持一致。" className={fieldClass} /></label>

                <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.04]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-gray-900 dark:text-white">批量变量预览</div><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">每个变量的值用逗号或换行分隔；当前只计算组合，不会自动提交生成。</p></div><div className="rounded-xl bg-blue-50 px-3 py-2 text-right dark:bg-blue-500/10"><div className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-300">{getCreationBatchCombinationCount(activeProject)}</div><div className="text-[10px] text-blue-600 dark:text-blue-300">预计组合</div></div></div>
                  <div className="mt-4 space-y-3">
                    {activeProject.series.variables.map((variable) => <div key={variable.id} className="grid gap-2 sm:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-start"><input value={variable.name} onChange={(event) => updateVariable(variable.id, { name: event.target.value })} className={smallFieldClass} aria-label="变量名称" /><input value={variable.values.join('、')} onChange={(event) => updateVariable(variable.id, { values: event.target.value.split(/[,，、\n]/).map((value) => value.trim()).filter(Boolean) })} placeholder="例如：经营分析、工作会、季度总结" className={smallFieldClass} aria-label="变量值" /><button type="button" onClick={() => removeVariable(variable.id)} className="min-h-11 rounded-xl px-3 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">删除</button></div>)}
                    <button type="button" onClick={addVariable} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-600 dark:border-white/[0.15] dark:text-gray-300"><PlusIcon className="h-4 w-4" />添加变量</button>
                  </div>
                </div>
              </div>
            )}

            <div className={activeModule === 'series' ? 'mt-4' : 'hidden'}>
              <CreationBatchPanel
                project={activeProject}
                currentPrompt={currentPrompt}
                inputImages={inputImages}
                onBusyChange={handleBatchBusyChange}
              />
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 z-10 mt-6 flex min-w-0 w-full max-w-full flex-col gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/95 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">自动保存在本机 · 不新增 AI 调用 · 应用后仍可在输入栏继续修改</div>
          <div className="flex min-w-0 w-full gap-2 sm:w-auto"><button type="button" onClick={requestClose} className="min-h-11 min-w-0 flex-1 rounded-xl bg-gray-100 px-4 text-xs font-medium text-gray-700 dark:bg-white/[0.07] dark:text-gray-200 sm:flex-none">返回</button><button type="button" onClick={() => void handleApplyToPrompt()} className="min-h-11 min-w-0 flex-1 rounded-xl bg-blue-600 px-4 text-xs font-medium text-white hover:bg-blue-700 sm:flex-none">应用到当前提示词</button></div>
        </div>
      </div>
    </main>
  )
}
