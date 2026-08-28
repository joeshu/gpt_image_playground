import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../../store'
import { clearImageCaches } from '../../lib/imageCache'
import { inspectAppStorage, removeOrphanedImages, type AppStorageUsage, type StorageReferenceState } from '../../lib/storageUsage'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function getReferenceState(): StorageReferenceState {
  const state = useStore.getState()
  return {
    tasks: state.tasks,
    agentConversations: state.agentConversations,
    inputImages: state.inputImages,
    maskDraft: state.maskDraft,
    maskEditorImageId: state.maskEditorImageId,
    galleryInputDraft: state.galleryInputDraft,
    agentInputDrafts: state.agentInputDrafts,
  }
}

export default function StorageUsageCard() {
  const setConfirmDialog = useStore((state) => state.setConfirmDialog)
  const showToast = useStore((state) => state.showToast)
  const [usage, setUsage] = useState(0)
  const [quota, setQuota] = useState(0)
  const [appUsage, setAppUsage] = useState<AppStorageUsage | null>(null)
  const [cleared, setCleared] = useState(false)

  const refresh = useCallback(() => {
    if (navigator.storage?.estimate) {
      void navigator.storage.estimate().then((estimate) => {
        setUsage(estimate.usage ?? 0)
        setQuota(estimate.quota ?? 0)
      }).catch((error) => console.warn('Failed to estimate local storage:', error))
    }
    void inspectAppStorage(getReferenceState()).then(setAppUsage).catch((error) => {
      console.warn('Failed to inspect app storage:', error)
    })
  }, [])

  useEffect(refresh, [refresh])

  const ratio = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0
  const appBytes = (appUsage?.imageBytes ?? 0) + (appUsage?.thumbnailBytes ?? 0)

  return (
    <div className="rounded-xl border border-gray-200/70 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">应用存储空间</span>
        <button
          type="button"
          onClick={() => {
            clearImageCaches()
            setCleared(true)
            window.setTimeout(() => setCleared(false), 1800)
          }}
          className="shrink-0 rounded-lg border border-gray-200/80 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08]"
        >
          {cleared ? '已释放' : '释放运行缓存'}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-gray-100/80 px-2 py-2 dark:bg-white/[0.05]">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{formatBytes(appUsage?.imageBytes ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-gray-500">原图 · {appUsage?.imageCount ?? 0}</div>
        </div>
        <div className="rounded-lg bg-gray-100/80 px-2 py-2 dark:bg-white/[0.05]">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{formatBytes(appUsage?.thumbnailBytes ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-gray-500">缩略图 · {appUsage?.thumbnailCount ?? 0}</div>
        </div>
        <div className="rounded-lg bg-gray-100/80 px-2 py-2 dark:bg-white/[0.05]">
          <div className={`text-sm font-semibold ${appUsage?.orphanCount ? 'text-amber-600 dark:text-amber-400' : 'text-gray-800 dark:text-gray-100'}`}>{formatBytes(appUsage?.orphanBytes ?? 0)}</div>
          <div className="mt-0.5 text-[11px] text-gray-500">可安全清理 · {appUsage?.orphanCount ?? 0}</div>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/[0.08]">
        <div className={`h-full rounded-full transition-all ${ratio >= 85 ? 'bg-red-500' : ratio >= 65 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${ratio}%` }} />
      </div>
      <div data-selectable-text className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-500">
        应用图片约 {formatBytes(appBytes)}。{quota > 0 ? `当前容器共使用 ${formatBytes(usage)}，系统可分配上限 ${formatBytes(quota)}。` : '当前环境不支持读取系统配额。'}
        {ratio >= 85 ? ' 空间接近上限，建议清理孤立图片或删除不需要的历史任务。' : ''}
      </div>

      {(appUsage?.orphanCount ?? 0) > 0 && (
        <button
          type="button"
          onClick={() => {
            setConfirmDialog({
              title: '清理孤立图片',
              message: `将删除 ${appUsage?.orphanCount ?? 0} 个未被任务、对话或输入草稿引用的图片文件，预计释放 ${formatBytes(appUsage?.orphanBytes ?? 0)}。历史任务和原图引用不会受影响。`,
              confirmText: '安全清理',
              cancelText: '取消',
              action: async () => {
                try {
                  const count = await removeOrphanedImages(getReferenceState())
                  showToast(`已安全清理 ${count} 个孤立图片文件`, 'success')
                  refresh()
                  return true
                } catch (error) {
                  console.error(error)
                  showToast('清理失败，未修改历史任务', 'error')
                  return false
                }
              },
            })
          }}
          className="mt-3 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/15"
        >
          安全清理孤立图片
        </button>
      )}
    </div>
  )
}
