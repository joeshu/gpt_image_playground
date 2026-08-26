import { useEffect, useState } from 'react'
import { initStore, restoreExplicitPresetConfig, useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, getExplicitUrlSettingsIds, hasUrlSettingParams } from './lib/urlSettings'
import { createDefaultOpenAIProfile, hasDefaultPresetConfig, isAgentTextApiProfile, normalizeSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, hasEmbeddedDefaultConfig, loadCustomProviderSettingsFromUrl, loadEmbeddedDefaultConfig } from './lib/customProviderConfigUrl'
import { getDefaultPresetProfileId, getPresetProfileIds, isPresetConfigOnlyEnabled, setPresetConfig } from './lib/presetConfig'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import CreationWorkbench from './components/CreationWorkbench'
import SupportPromptModal from './components/SupportPromptModal'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'
import { subscribeNativeLifecycle } from './lib/nativeLifecycle'
import { clearImageCaches } from './lib/imageCache'
import { subscribeNotificationActions } from './lib/browserNotification'

let defaultConfigImportStarted = false
let resolveStoreReady: (() => void) | null = null
const storeReady = new Promise<void>((resolve) => { resolveStoreReady = resolve })

export default function App() {
  const appMode = useStore((s) => s.appMode)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const showToast = useStore((s) => s.showToast)
  const [creationWorkbenchOpen, setCreationWorkbenchOpen] = useState(false)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    let disposed = false
    let removeNativeListeners: (() => void) | null = null
    let lastRefreshAt = 0
    let pausedAt = 0

    const refreshAfterInterruption = (reason: 'network' | 'resume') => {
      const now = Date.now()
      if (now - lastRefreshAt < 1500) return
      lastRefreshAt = now

      // 活跃请求仍由原 Promise/恢复计时器负责，重新载入 IndexedDB 会覆盖内存中的最新状态。
      if (useStore.getState().tasks.some((task) => task.status === 'running')) {
        if (reason === 'network') showToast('网络已恢复，正在继续当前任务', 'success')
        return
      }

      if (reason === 'network') showToast('网络已恢复，正在检查未完成任务', 'success')
      void initStore().catch((error) => console.warn(`Failed to refresh local tasks after ${reason}:`, error))
    }

    const handleOffline = () => showToast('当前处于离线状态，已保留输入内容，暂时无法提交新请求', 'info')
    const handleOnline = () => refreshAfterInterruption('network')
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAfterInterruption('resume')
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)

    void subscribeNativeLifecycle({
      onPause: () => {
        pausedAt = Date.now()
      },
      onResume: () => {
        if (pausedAt && Date.now() - pausedAt < 1500) return
        refreshAfterInterruption('resume')
      },
      onMemoryWarning: () => {
        clearImageCaches()
        console.warn('Released transient image caches after iOS memory warning')
      },
    }).then((remove) => {
      if (disposed) remove()
      else removeNativeListeners = remove
    }).catch((error) => {
      console.warn('Failed to subscribe to native lifecycle events:', error)
    })

    return () => {
      disposed = true
      removeNativeListeners?.()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [showToast])

  useEffect(() => {
    let disposed = false
    let removeNotificationActions: (() => void) | null = null

    void subscribeNotificationActions(async (target) => {
      await storeReady
      const state = useStore.getState()
      if (target.conversationId) {
        state.setActiveAgentConversationId(target.conversationId)
        state.setAppMode('agent')
        window.requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }))
        return
      }
      if (target.taskId) state.setDetailTaskId(target.taskId)
    }).then((remove) => {
      if (disposed) remove()
      else removeNotificationActions = remove
    }).catch((error) => console.warn('Failed to subscribe to notification actions:', error))

    return () => {
      disposed = true
      removeNotificationActions?.()
    }
  }, [])

  useEffect(() => {
    if (defaultConfigImportStarted) return
    defaultConfigImportStarted = true

    const searchParams = new URLSearchParams(window.location.search)
    const customProviderConfigUrl = getCustomProviderConfigUrl()
    const embeddedDefaultConfig = hasEmbeddedDefaultConfig()
    const loadDefaultConfig = () => embeddedDefaultConfig
      ? Promise.resolve().then(() => loadEmbeddedDefaultConfig())
      : loadCustomProviderSettingsFromUrl(customProviderConfigUrl)

    const applyUrlSettings = async (baseSettings: Partial<AppSettings>) => {
      const ids = getExplicitUrlSettingsIds(searchParams)
      const restored = await restoreExplicitPresetConfig(ids)
      const restoredSettings = useStore.getState().settings
      const sourceSettings = restored
        ? { ...restoredSettings, ...baseSettings, customProviders: restoredSettings.customProviders, profiles: restoredSettings.profiles }
        : baseSettings
      const nextSettings = buildSettingsFromUrlParams(sourceSettings, searchParams)
      return Object.keys(nextSettings).length ? nextSettings : sourceSettings
    }

    const clearAppliedUrlSettings = () => {
      if (!hasUrlSettingParams(searchParams)) return

      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    void initStore()
      .then(async () => {
        resolveStoreReady?.()
        resolveStoreReady = null
        const importedSettings = embeddedDefaultConfig || customProviderConfigUrl
          ? await loadDefaultConfig()
          : hasDefaultPresetConfig()
            ? {
                customProviders: [],
                profiles: [{ ...createDefaultOpenAIProfile(), isDefault: true }],
              }
            : null
        setPresetConfig(importedSettings)

        const state = useStore.getState()
        if (importedSettings) {
          await state.setPresetImportedSettings(importedSettings)
        } else if (state.previousPresetConfig) {
          await state.setPresetImportedSettings({ customProviders: [], profiles: [] })
        }

        const syncedState = useStore.getState()
        if (!importedSettings) {
          useStore.setState({ dismissedPresetProfileIds: [], dismissedPresetProviderIds: [] })
          if (syncedState.settings.profiles.some((profile) => profile.isDefault)) {
            syncedState.setSettings({
              profiles: syncedState.settings.profiles.map((profile) => profile.isDefault ? { ...profile, isDefault: undefined } : profile),
            })
          }
        }

        const current = useStore.getState()
        const presetIds = getPresetProfileIds()
        const defaultPresetId = getDefaultPresetProfileId()
        const settings = isPresetConfigOnlyEnabled()
          ? normalizeSettings({
              ...current.settings,
              activeProfileId: presetIds.has(current.settings.activeProfileId)
                ? current.settings.activeProfileId
                : defaultPresetId ?? [...presetIds][0],
              agentTextProfileId: current.settings.agentTextProfileId && presetIds.has(current.settings.agentTextProfileId)
                ? current.settings.agentTextProfileId
                : current.settings.profiles.find((profile) => presetIds.has(profile.id) && isAgentTextApiProfile(profile))?.id ?? null,
              agentImageProfileId: current.settings.agentImageProfileId && presetIds.has(current.settings.agentImageProfileId)
                ? current.settings.agentImageProfileId
                : defaultPresetId ?? [...presetIds][0],
            })
          : current.settings
        current.setSettings(await applyUrlSettings(settings))
        clearAppliedUrlSettings()
      })
      .catch((error) => {
        resolveStoreReady?.()
        resolveStoreReady = null
        console.warn('Failed to import preset config:', error)
        setPresetConfig(null)
        const state = useStore.getState()
        void applyUrlSettings(state.settings).then((settings) => {
          useStore.getState().setSettings(settings)
          clearAppliedUrlSettings()
        })
      })
  }, [])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header
        creationWorkbenchOpen={creationWorkbenchOpen}
        onOpenCreationWorkbench={() => setCreationWorkbenchOpen(true)}
      />
      {creationWorkbenchOpen ? (
        <CreationWorkbench onClose={() => setCreationWorkbenchOpen(false)} />
      ) : appMode === 'agent' ? (
        <AgentWorkspace />
      ) : (
        <main data-home-main data-drag-select-surface className="home-main-content">
          <div className="safe-area-x max-w-7xl mx-auto">
            <SearchBar />
            {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
          </div>
        </main>
      )}
      {!creationWorkbenchOpen && <InputBar />}
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <SupportPromptModal />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
