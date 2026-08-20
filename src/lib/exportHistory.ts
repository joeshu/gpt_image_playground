export interface ExportHistoryEntry {
  id: string
  fileName: string
  kind: 'image' | 'zip'
  count: number
  createdAt: number
}

const STORAGE_KEY = 'gpt-image-playground.export-history'
const MAX_ENTRIES = 20

function readEntries() {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is ExportHistoryEntry => (
      entry && typeof entry === 'object'
      && typeof entry.id === 'string'
      && typeof entry.fileName === 'string'
      && (entry.kind === 'image' || entry.kind === 'zip')
      && typeof entry.count === 'number'
      && typeof entry.createdAt === 'number'
    ))
  } catch {
    return []
  }
}

export function getExportHistory() {
  return readEntries()
}

export function addExportHistory(fileName: string, count: number) {
  if (typeof window === 'undefined' || !fileName || count <= 0) return
  const entry: ExportHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    kind: fileName.toLowerCase().endsWith('.zip') ? 'zip' : 'image',
    count,
    createdAt: Date.now(),
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...readEntries()].slice(0, MAX_ENTRIES)))
  } catch {
    // 记录失败不影响图片导出结果。
  }
}

export function clearExportHistory() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}
