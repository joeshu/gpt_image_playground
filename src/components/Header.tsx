import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { useTooltip } from '../hooks/useTooltip'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import { isIosDevice, isNativeApp } from '../lib/platform'
import ViewportTooltip from './ViewportTooltip'
import HelpModal from './HelpModal'
import HistoryModal from './HistoryModal'
import { useFavoriteCollectionTitle } from './FavoriteCollections'
import { EditIcon, HelpCircleIcon, HistoryIcon, InstallIcon, SettingsIcon } from './icons'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isInstalledPwa() {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

interface HeaderProps {
  activeSurface: 'home' | 'creation' | 'results'
  onOpenHome: (mode: 'gallery' | 'agent') => void
  onOpenCreationWorkbench: () => void
  onOpenResultsCenter: () => void
  onOpenSettings?: () => void
}

export default function Header({ activeSurface, onOpenHome, onOpenCreationWorkbench, onOpenResultsCenter, onOpenSettings }: HeaderProps) {
  const appMode = useStore((s) => s.appMode)
  const setAppMode = useStore((s) => s.setAppMode)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const activeConversation = agentConversations.find((item) => item.id === activeAgentConversationId)
  const favoriteCollectionTitle = useFavoriteCollectionTitle()
  const isAgentSurface = activeSurface === 'home' && appMode === 'agent'
  const isGallerySurface = activeSurface === 'home' && appMode === 'gallery'
  const showFavoriteCollectionTitle = isGallerySurface && Boolean(activeFavoriteCollectionId)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [showHelp, setShowHelp] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const nativeApp = isNativeApp()
  const [isPwaInstalled, setIsPwaInstalled] = useState(() => nativeApp || isInstalledPwa())
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const historyButtonRef = useRef<HTMLButtonElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const headerSpacerRef = useRef<HTMLDivElement>(null)
  const createConversation = useStore((s) => s.createAgentConversation)

  useLayoutEffect(() => {
    // The header is fixed so iOS cannot move it with the document while a
    // drawer/input transition is being committed. Keep a real flow slot in
    // sync with its measured height instead of using a second approximate
    // header tree as a spacer.
    const header = headerRef.current
    const spacer = headerSpacerRef.current
    if (!header || !spacer) return
    const root = document.documentElement
    const previousHeaderHeight = root.style.getPropertyValue('--global-header-height')

    const syncSpacerHeight = () => {
      const height = Math.ceil(header.getBoundingClientRect().height)
      if (height > 0) {
        const value = `${height}px`
        spacer.style.height = value
        root.style.setProperty('--global-header-height', value)
      }
    }

    syncSpacerHeight()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSpacerHeight) : null
    observer?.observe(header)
    window.addEventListener('resize', syncSpacerHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', syncSpacerHeight)
      spacer.style.height = ''
      if (previousHeaderHeight) root.style.setProperty('--global-header-height', previousHeaderHeight)
      else root.style.removeProperty('--global-header-height')
    }
  }, [])

  const installTooltip = useTooltip()
  const helpTooltip = useTooltip()
  const settingsTooltip = useTooltip()

  useEffect(() => {
    if (nativeApp) return

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIsPwaInstalled(false)
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsPwaInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [nativeApp])

  const handleInstallClick = async () => {
    if (installPrompt) {
      const promptEvent = installPrompt
      setInstallPrompt(null)

      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        setIsPwaInstalled(choice.outcome === 'accepted')
      } catch {
        setIsPwaInstalled(isInstalledPwa())
      }
    } else {
      if (isIosDevice()) {
        setConfirmDialog({
          title: '安装为应用',
          message: '在 Safari 浏览器中，点击底部「分享」按钮，选择「添加到主屏幕」即可安装此应用。',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      } else {
        setConfirmDialog({
          title: '安装为应用',
          message: '请在浏览器的菜单中选择「添加到主屏幕」或「安装应用」。\n\n（如果在微信等内置浏览器中，请先在外部浏览器打开）',
          showCancel: false,
          confirmText: '我知道了',
          icon: 'info',
          action: () => {},
        })
      }
    }
  }

  return (
    <>
      <header ref={headerRef} data-global-header data-no-drag-select className="safe-area-top fixed top-0 left-0 right-0 z-40 w-full translate-y-0 bg-white/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08] dark:bg-gray-950/80">
        <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between gap-1 relative">
          <div className="flex min-w-0 flex-1 items-center gap-1 pr-1 sm:gap-2 sm:pr-2">
            <h1 className="relative mr-1 inline-flex min-w-0 items-start sm:mr-2">
              {showFavoriteCollectionTitle ? (
                <>
                  <span className="min-w-0 truncate text-[17px] font-bold tracking-tight text-gray-800 dark:text-gray-100 sm:hidden" title={favoriteCollectionTitle}>{favoriteCollectionTitle}</span>
                  <a
                    href="https://github.com/CookSleep/gpt_image_playground"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden text-lg font-bold tracking-tight text-gray-800 transition-colors hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300 sm:inline"
                  >
                    GPT Image Playground
                  </a>
                </>
              ) : (
                <a
                  href="https://github.com/CookSleep/gpt_image_playground"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-[16px] font-bold tracking-tight text-gray-800 transition-colors hover:text-gray-600 dark:text-gray-100 dark:hover:text-gray-300 sm:text-lg"
                >
                  GPT Image Playground
                </a>
              )}
              {hasUpdate && latestRelease && (
                <a
                  href={latestRelease.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={dismiss}
                  className="absolute -right-1 -top-1 translate-x-full -translate-y-1/4 px-1 py-0.5 rounded-[4px] border border-red-500/30 text-[9px] font-black bg-red-500 text-white hover:bg-red-600 transition-all animate-fade-in leading-none shadow-sm"
                  title={`新版本 ${latestRelease.tag}`}
                >
                  NEW
                </a>
              )}
            </h1>
            {isAgentSurface && <div className="hidden sm:flex items-center gap-1 relative">
              <button
                ref={historyButtonRef}
                type="button"
                onClick={() => setShowHistoryModal((visible) => !visible)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200 transition-colors"
                title="历史任务"
                aria-label="历史任务"
              >
                <HistoryIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppMode('agent')
                  createConversation()
                }}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200 transition-colors"
                title="新对话"
                aria-label="新对话"
              >
                <EditIcon className="w-5 h-5" />
              </button>
              {showHistoryModal && (
                <HistoryModal onClose={() => setShowHistoryModal(false)} ignoreOutsideClickRef={historyButtonRef} />
              )}
            </div>}
          </div>
          {isAgentSurface && activeConversation && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden sm:flex max-w-[30%]">
              <button
                type="button"
                onClick={() => {
                  setShowHistoryModal(true)
                  // Use setTimeout to ensure HistoryModal is mounted before setting editing id
                  setTimeout(() => {
                    useStore.getState().setAgentEditingConversationId(activeConversation.id)
                  }, 0)
                }}
                className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate hover:bg-gray-100 dark:hover:bg-white/[0.04] px-2 py-1 rounded transition-colors"
              >
                {activeConversation.title || 'Agent'}
              </button>
            </div>
          )}
          {showFavoriteCollectionTitle && (
            <div className="absolute left-1/2 top-1/2 hidden max-w-[30%] -translate-x-1/2 -translate-y-1/2 sm:flex">
              <div className="truncate rounded px-2 py-1 text-sm font-semibold text-gray-700 dark:text-gray-300" title={favoriteCollectionTitle}>
                {favoriteCollectionTitle}
              </div>
            </div>
          )}
          <div className="hidden sm:flex items-center gap-1 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-100/70 dark:bg-white/[0.04] p-1 mr-4">
            <button
              type="button"
              onClick={() => onOpenHome('gallery')}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${activeSurface === 'home' && appMode === 'gallery' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              画廊
            </button>
            <button
              type="button"
              onClick={() => onOpenHome('agent')}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${activeSurface === 'home' && appMode === 'agent' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={onOpenCreationWorkbench}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${activeSurface === 'creation' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              工作台
            </button>
            <button
              type="button"
              onClick={onOpenResultsCenter}
              className={`px-3.5 py-1.5 rounded-lg text-sm transition-colors ${activeSurface === 'results' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              结果
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {!isPwaInstalled && (
              <div
                className="relative"
                {...installTooltip.handlers}
              >
                <button
                  onClick={() => {
                    dismissAllTooltips()
                    handleInstallClick()
                  }}
                   className="flex h-11 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 sm:w-11"
                  aria-label="安装为应用"
                >
                  <InstallIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
                <ViewportTooltip visible={installTooltip.visible} className="whitespace-nowrap">
                  安装为应用
                </ViewportTooltip>
              </div>
            )}
            <div
              className="relative"
              {...helpTooltip.handlers}
            >
              <button
                onClick={() => {
                  dismissAllTooltips()
                  setShowHelp(true)
                }}
                 className="flex h-11 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 sm:w-11"
                aria-label="操作指南"
              >
                <HelpCircleIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={helpTooltip.visible} className="whitespace-nowrap">
                操作指南
              </ViewportTooltip>
            </div>
            <div
              className="relative"
              {...settingsTooltip.handlers}
            >
              <button
                onClick={() => onOpenSettings ? onOpenSettings() : setShowSettings(true)}
                 className="flex h-11 w-10 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-gray-900 sm:w-11"
                aria-label="设置"
              >
                <SettingsIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <ViewportTooltip visible={settingsTooltip.visible} className="whitespace-nowrap">
                设置
              </ViewportTooltip>
            </div>
          </div>
        </div>
        <div className="safe-area-x sm:hidden pb-1.5">
          <div className="grid min-h-10 grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-gray-100/70 p-1 dark:border-white/[0.08] dark:bg-white/[0.04]">
            <button
              type="button"
              onClick={() => onOpenHome('gallery')}
              className={`px-1 py-1.5 rounded-lg text-xs transition-colors ${activeSurface === 'home' && appMode === 'gallery' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              画廊
            </button>
            <button
              type="button"
              onClick={() => onOpenHome('agent')}
              className={`px-1 py-1.5 rounded-lg text-xs transition-colors ${activeSurface === 'home' && appMode === 'agent' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              Agent
            </button>
            <button
              type="button"
              onClick={onOpenCreationWorkbench}
              className={`px-1 py-1.5 rounded-lg text-xs transition-colors ${activeSurface === 'creation' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              工作台
            </button>
            <button
              type="button"
              onClick={onOpenResultsCenter}
              className={`px-1 py-1.5 rounded-lg text-xs transition-colors ${activeSurface === 'results' ? 'bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm font-medium' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
            >
              结果
            </button>
          </div>
        </div>
      </header>

      <div ref={headerSpacerRef} data-global-header-spacer aria-hidden="true" />

      {showHelp && <HelpModal appMode={isAgentSurface ? 'agent' : 'gallery'} isFavoriteCollectionOverview={isGallerySurface && filterFavorite && !activeFavoriteCollectionId} onClose={() => setShowHelp(false)} />}
    </>
  )
}
