export class StorageQuotaError extends Error {
  constructor() {
    super('本地存储空间不足，请先导出数据或清理旧任务后重试')
    this.name = 'StorageQuotaError'
  }
}

export type StorageEstimate = {
  usage: number
  quota: number
  usageRatio: number
  available: number
}

export async function estimateStorage(): Promise<StorageEstimate | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  const usage = estimate.usage ?? 0
  const quota = estimate.quota ?? 0
  if (!quota) return { usage, quota, usageRatio: 0, available: 0 }
  return { usage, quota, usageRatio: usage / quota, available: Math.max(0, quota - usage) }
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function isStorageQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
}
