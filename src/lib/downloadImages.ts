import { zipSync } from 'fflate'
import type { TaskRecord } from '../types'
import { getNumberedFileNameBase, sanitizeFileNamePart } from './exportFileName'
import { ensureImageCached } from './imageCache'

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
    const blobs: Blob[] = []
    for (const imageId of imageIds) {
      try {
        blobs.push(await getImageBlob(imageId))
      } catch (err) {
        console.error(err)
        failCount++
      }
    }

    if (blobs.length > 0) {
      const entries = await Promise.all(blobs.map(async (blob, index) => [
        `${fileNameBase}-${String(index + 1).padStart(2, '0')}.${getBlobExtension(blob)}`,
        new Uint8Array(await blob.arrayBuffer()),
      ] as const))
      const zipped = zipSync(Object.fromEntries(entries), { level: 6 })
      const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
      await shareDownload(new Blob([buffer], { type: 'application/zip' }), `${sanitizeFileNamePart(fileNameBase) || 'images'}.zip`)
      return { successCount: blobs.length, failCount, locationHint: '请在系统分享面板中选择“存储到文件”' }
    }
    return { successCount: 0, failCount }
  }

  for (let index = 0; index < imageIds.length; index++) {
    try {
      const blob = await getImageBlob(imageIds[index])
      const order = String(index + 1).padStart(2, '0')
      const fileName = multiple
        ? `${fileNameBase}-${order}.${getBlobExtension(blob)}`
        : `${fileNameBase}.${getBlobExtension(blob)}`
      if (isNativeApp()) await shareDownload(blob, fileName)
      else triggerDownload(blob, fileName)
      successCount++
      if (multiple) await delay(100)
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  return { successCount, failCount, locationHint: isNativeApp() && successCount > 0 ? '请在系统分享面板中选择“存储到文件”' : undefined }
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
    if (isNativeApp()) await shareDownload(zipBlob, fileName)
    else triggerDownload(zipBlob, fileName)
  }

  return { successCount, failCount, locationHint: isNativeApp() && successCount > 0 ? '请在系统分享面板中选择“存储到文件”' : undefined }
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

async function shareDownload(blob: Blob, fileName: string) {
  if (typeof navigator.share !== 'function') {
    throw new Error('当前 iOS 环境不支持系统文件分享')
  }

  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare && !navigator.canShare({ files: [file] })) {
    throw new Error('当前 iOS 环境不支持分享此文件')
  }
  await navigator.share({ files: [file], title: fileName })
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
