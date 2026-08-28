import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './platform'

interface NativeExportPlugin {
  share(options: {
    base64: string
    fileName: string
    mimeType: string
  }): Promise<{ cancelled: boolean }>
}

const NativeExport = registerPlugin<NativeExportPlugin>('NativeExport')
const MAX_NATIVE_EXPORT_BYTES = 96 * 1024 * 1024

export async function shareNativeBlob(blob: Blob, fileName: string) {
  if (!isNativeApp()) throw new Error('Native export is not available')
  if (blob.size > MAX_NATIVE_EXPORT_BYTES) {
    throw new Error('单次导出文件不能超过 96 MB，请减少选择数量后重试')
  }

  const base64 = await blobToBase64(blob)
  return NativeExport.share({
    base64,
    fileName,
    mimeType: blob.type || 'application/octet-stream',
  })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const separator = result.indexOf(',')
      if (separator < 0) {
        reject(new Error('文件编码失败'))
        return
      }
      resolve(result.slice(separator + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'))
    reader.readAsDataURL(blob)
  })
}
