import { zipSync } from 'fflate'
import type { TaskRecord } from '../types'
import { getNumberedFileNameBase, sanitizeFileNamePart } from './exportFileName'
import { ensureImageCached } from './imageCache'
import { addExportHistory } from './exportHistory'
import { isNativeApp } from './platform'

const NATIVE_EXPORT_BATCH_SIZE = 8

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

type DownloadMethod = 'share' | 'download'

export interface DownloadImageZipEntry {
  imageId: string
  fileNameBase?: string
}

type TaskOutputZipTask = Pick<TaskRecord, 'id' | 'createdAt' | 'outputImages'>

export { formatExportFileTime } from './exportFileName'

async function downloadNativeImageBatches(imageIds: string[], fileNameBase: string): Promise<DownloadImagesResult> {
  return downloadNativeZipBatches(getImageZipEntries(imageIds, fileNameBase), fileNameBase)
}

async function downloadNativeZipBatches(entries: DownloadImageZipEntry[], zipFileNameBase: string): Promise<DownloadImagesResult> {
  let successCount = 0
  let failCount = 0
  let lastFileName: string | undefined
  let lastHint: string | undefined
  const totalBatches = Math.ceil(entries.length / NATIVE_EXPORT_BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batch = entries.slice(batchIndex * NATIVE_EXPORT_BATCH_SIZE, (batchIndex + 1) * NATIVE_EXPORT_BATCH_SIZE)
    const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}
    let batchSuccessCount = 0
    let batchFailCount = 0
    const usedNames = new Set<string>()

    for (const entry of batch) {
      try {
        const blob = await getImageBlob(entry.imageId)
        const base = sanitizeFileNamePart(entry.fileNameBase || 'image') || 'image'
        const ext = getBlobExtension(blob)
        let fileName = `${base}.${ext}`
        let duplicateIndex = 2
        while (usedNames.has(fileName)) {
          fileName = `${base}-${String(duplicateIndex).padStart(2, '0')}.${ext}`
          duplicateIndex++
        }
        usedNames.add(fileName)
        zipFiles[fileName] = [new Uint8Array(await blob.arrayBuffer()), { mtime: new Date() }]
        batchSuccessCount++
      } catch (err) {
        console.error(err)
        batchFailCount++
      }
    }

    if (batchSuccessCount === 0) {
      failCount += batchFailCount
      continue
    }

    const zipped = zipSync(zipFiles, { level: 6 })
    const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
    const baseName = sanitizeFileNamePart(zipFileNameBase) || 'images'
    const fileName = totalBatches === 1 ? `${baseName}.zip` : `${baseName}-${String(batchIndex + 1).padStart(2, '0')}.zip`
    const shareResult = await shareDownload(new Blob([buffer], { type: 'application/zip' }), fileName)
    if (shareResult.cancelled) {
      return {
        successCount,
        failCount,
        fileName,
        locationHint: successCount > 0 ? `已取消后续分享，已完成 ${successCount} 张图片` : '已取消分享',
        cancelled: true,
      }
    }

    successCount += batchSuccessCount
    failCount += batchFailCount
    lastFileName = fileName
    lastHint = getDownloadHint(shareResult.method, fileName)
    addExportHistory(fileName, batchSuccessCount)
    if (batchIndex + 1 < totalBatches) await delay(150)
  }

  return {
    successCount,
    failCount,
    fileName: lastFileName,
    locationHint: lastHint,
  }
}

export async function downloadImageIds(imageIds: string[], fileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (imageIds.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const multiple = imageIds.length > 1

  if (isNativeApp() && multiple) {
    return downloadNativeImageBatches(imageIds, fileNameBase)
  }

  let lastFileName: string | undefined
  let lastDownloadMethod: DownloadMethod | undefined
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
      lastDownloadMethod = shareResult?.method ?? 'download'
      successCount++
      if (!multiple) addExportHistory(fileName, 1)
      if (multiple) await delay(100)
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  if (multiple && successCount > 0 && !isNativeApp()) addExportHistory(`${sanitizeFileNamePart(fileNameBase) || 'images'} (${successCount} files)`, successCount)
  return {
    successCount,
    failCount,
    fileName: successCount > 0 ? lastFileName : undefined,
    locationHint: isNativeApp() && successCount > 0 && lastFileName && lastDownloadMethod
      ? getDownloadHint(lastDownloadMethod, lastFileName)
      : undefined,
  }
}

export async function downloadImageEntriesAsZip(entries: DownloadImageZipEntry[], zipFileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (entries.length === 0) return { successCount: 0, failCount: 0 }
  if (isNativeApp()) return downloadNativeZipBatches(entries, zipFileNameBase)

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
    const method = shareResult?.method ?? 'download'
    return {
      successCount,
      failCount,
      fileName,
      locationHint: isNativeApp() ? getDownloadHint(method, fileName) : undefined,
    }
  }

  return { successCount, failCount, fileName: undefined }
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

async function shareDownload(blob: Blob, fileName: string): Promise<{ cancelled: boolean; method: DownloadMethod }> {
  if (typeof navigator.share !== 'function') {
    triggerDownload(blob, fileName)
    return { cancelled: false, method: 'download' }
  }

  const file = new File([blob], fileName, { type: blob.type })
  try {
    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      triggerDownload(blob, fileName)
      return { cancelled: false, method: 'download' }
    }
  } catch {
    triggerDownload(blob, fileName)
    return { cancelled: false, method: 'download' }
  }
  try {
    await navigator.share({ files: [file], title: fileName })
    return { cancelled: false, method: 'share' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { cancelled: true, method: 'share' }
    throw err
  }
}

function getDownloadHint(method: DownloadMethod, fileName: string) {
  return method === 'share'
    ? `已分享 ${fileName}，请在系统分享面板中选择“存储到文件”`
    : `已开始下载 ${fileName}`
}

function getBlobExtension(blob: Blob): string {
  return MIME_EXTENSIONS[blob.type.toLowerCase()] ?? blob.type.split('/')[1] ?? 'png'
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
