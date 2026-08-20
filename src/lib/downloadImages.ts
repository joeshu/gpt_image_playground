import { zipSync } from 'fflate'
import type { TaskRecord } from '../types'
import { getNumberedFileNameBase, sanitizeFileNamePart } from './exportFileName'
import { ensureImageCached } from './imageCache'
import { addExportHistory } from './exportHistory'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface DownloadImagesResult {
  successCount: number
  failCount: number
  locationHint?: string
  fileName?: string
  cancelled?: boolean
}

export interface DownloadImageZipEntry {
  imageId: string
  fileNameBase?: string
}

type TaskOutputZipTask = Pick<TaskRecord, 'id' | 'createdAt' | 'outputImages'>

export { formatExportFileTime } from './exportFileName'

export async function downloadImageIds(imageIds: string[], fileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (imageIds.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const multiple = imageIds.length > 1

  if (isNativeApp() && multiple) {
    const blobs: Array<{ blob: Blob; index: number }> = []
    for (let index = 0; index < imageIds.length; index++) {
      try {
        blobs.push({ blob: await getImageBlob(imageIds[index]), index })
      } catch (err) {
        console.error(err)
        failCount++
      }
    }

    if (blobs.length > 0) {
      const entries = await Promise.all(blobs.map(async ({ blob, index }) => [
        `${fileNameBase}-${String(index + 1).padStart(2, '0')}.${getBlobExtension(blob)}`,
        new Uint8Array(await blob.arrayBuffer()),
      ] as const))
      const zipped = zipSync(Object.fromEntries(entries), { level: 6 })
      const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
      const fileName = `${sanitizeFileNamePart(fileNameBase) || 'images'}.zip`
      const shareResult = await shareDownload(new Blob([buffer], { type: 'application/zip' }), fileName)
      if (!shareResult.cancelled) addExportHistory(fileName, blobs.length)
      return { successCount: shareResult.cancelled ? 0 : blobs.length, failCount: shareResult.cancelled ? 0 : failCount, fileName, locationHint: shareResult.cancelled ? '已取消分享' : `已分享 ${fileName}，请在系统分享面板中选择“存储到文件”`, cancelled: shareResult.cancelled }
    }
    return { successCount: 0, failCount }
  }

  let lastFileName: string | undefined
  for (let index = 0; index < imageIds.length; index++) {
    try {
      const blob = await getImageBlob(imageIds[index])
      const order = String(index + 1).padStart(2, '0')
      const fileName = multiple
        ? `${fileNameBase}-${order}.${getBlobExtension(blob)}`
        : `${fileNameBase}.${getBlobExtension(blob)}`
      lastFileName = fileName
      const shareResult = isNativeApp() ? await shareDownload(blob, fileName) : null
      if (shareResult?.cancelled) return { successCount, failCount, fileName, locationHint: '已取消分享', cancelled: true }
      if (!isNativeApp()) triggerDownload(blob, fileName)
      successCount++
      if (!multiple) addExportHistory(fileName, 1)
      if (multiple) await delay(100)
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  if (multiple && successCount > 0 && !isNativeApp()) addExportHistory(`${sanitizeFileNamePart(fileNameBase) || 'images'} (${successCount} files)`, successCount)
  return { successCount, failCount, fileName: successCount > 0 ? lastFileName : undefined, locationHint: isNativeApp() && successCount > 0 ? `已分享 ${lastFileName}，请在系统分享面板中选择“存储到文件”` : undefined }
}

export async function downloadImageEntriesAsZip(entries: DownloadImageZipEntry[], zipFileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (entries.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}
  const usedNames = new Set<string>()

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    try {
      const blob = await getImageBlob(entry.imageId)
      const order = String(index + 1).padStart(2, '0')
      const base = sanitizeFileNamePart(entry.fileNameBase || `image-${order}`) || `image-${order}`
      const ext = getBlobExtension(blob)
      let fileName = `${base}.${ext}`
      let duplicateIndex = 2
      while (usedNames.has(fileName)) {
        fileName = `${base}-${String(duplicateIndex).padStart(2, '0')}.${ext}`
        duplicateIndex++
      }
      usedNames.add(fileName)
      zipFiles[fileName] = [new Uint8Array(await blob.arrayBuffer()), { mtime: new Date() }]
      successCount++
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  if (successCount > 0) {
    const zipped = zipSync(zipFiles, { level: 6 })
    const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
    const zipBlob = new Blob([buffer], { type: 'application/zip' })
    const fileName = `${sanitizeFileNamePart(zipFileNameBase) || 'images'}.zip`
    const shareResult = isNativeApp() ? await shareDownload(zipBlob, fileName) : null
    if (shareResult?.cancelled) return { successCount: 0, failCount, fileName, locationHint: '已取消分享', cancelled: true }
    if (!isNativeApp()) triggerDownload(zipBlob, fileName)
    addExportHistory(fileName, successCount)
  }

  return { successCount, failCount, fileName: successCount > 0 ? `${sanitizeFileNamePart(zipFileNameBase) || 'images'}.zip` : undefined, locationHint: isNativeApp() && successCount > 0 ? `已分享 ${sanitizeFileNamePart(zipFileNameBase) || 'images'}.zip，请在系统分享面板中选择“存储到文件”` : undefined }
}

export function getTaskOutputImageZipEntries(tasks: TaskOutputZipTask[]): DownloadImageZipEntry[] {
  return [...tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((task) => getImageZipEntries(task.outputImages || [], `task-${task.id}`))
}

export function getImageZipEntries(imageIds: string[], fileNameBase = 'image'): DownloadImageZipEntry[] {
  return imageIds.map((imageId, index) => ({
    imageId,
    fileNameBase: getNumberedFileNameBase(fileNameBase, index, imageIds.length),
  }))
}

async function getImageBlob(imageIdOrUrl: string): Promise<Blob> {
  let src = imageIdOrUrl
  if (!imageIdOrUrl.startsWith('data:') && !imageIdOrUrl.startsWith('http://') && !imageIdOrUrl.startsWith('https://')) {
    src = await ensureImageCached(imageIdOrUrl) ?? imageIdOrUrl
  }

  const res = await fetch(src)
  if (!res.ok && !src.startsWith('data:')) throw new Error(`读取图片失败：${imageIdOrUrl}`)
  return await res.blob()
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function shareDownload(blob: Blob, fileName: string): Promise<{ cancelled: boolean }> {
  if (typeof navigator.share !== 'function') {
    triggerDownload(blob, fileName)
    return { cancelled: false }
  }

  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare && !navigator.canShare({ files: [file] })) {
    triggerDownload(blob, fileName)
    return { cancelled: false }
  }
  try {
    await navigator.share({ files: [file], title: fileName })
    return { cancelled: false }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { cancelled: true }
    throw err
  }
}

function isNativeApp() {
  return typeof window !== 'undefined' && (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:')
}

function getBlobExtension(blob: Blob): string {
  return MIME_EXTENSIONS[blob.type.toLowerCase()] ?? blob.type.split('/')[1] ?? 'png'
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
