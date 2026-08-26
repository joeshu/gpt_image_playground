import { useEffect, useState } from 'react'
import { clearImageCaches } from '../../lib/imageCache'

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(0, bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export default function StorageUsageCard() {
  const [usage, setUsage] = useState(0)
  const [quota, setQuota] = useState(0)
  const [cleared, setCleared] = useState(false)

  const refresh = () => {
    if (!navigator.storage?.estimate) return
    void navigator.storage.estimate().then((estimate) => {
      setUsage(estimate.usage ?? 0)
      setQuota(estimate.quota ?? 0)
    }).catch((error) => console.warn('Failed to estimate local storage:', error))
  }

  useEffect(refresh, [])

  const ratio = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0

  return (
    <div className="rounded-xl border border-gray-200/70 bg-white/60 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-600 dark:text-gray-300">本地存储空间</span>
        <button
          type="button"
          onClick={() => {
            clearImageCaches()
            setCleared(true)
            window.setTimeout(() => setCleared(false), 1800)
            refresh()
          }}
          className="shrink-0 rounded-lg border border-gray-200/80 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-gray-300 dark:hover:bg-white/[0.08]"
        >
          {cleared ? '已释放' : '释放运行缓存'}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200/80 dark:bg-white/[0.08]">
        <div className={`h-full rounded-full transition-all ${ratio >= 85 ? 'bg-red-500' : ratio >= 65 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${ratio}%` }} />
      </div>
      <div data-selectable-text className="mt-2 text-xs text-gray-500 dark:text-gray-500">
        {quota > 0 ? `应用与网站已使用 ${formatBytes(usage)}，系统可分配上限 ${formatBytes(quota)}。` : '当前环境不支持读取存储配额。'}
        {ratio >= 85 ? ' 空间接近上限，建议删除不需要的历史任务及图片。' : ' 释放运行缓存不会删除历史任务和原图。'}
      </div>
    </div>
  )
}
