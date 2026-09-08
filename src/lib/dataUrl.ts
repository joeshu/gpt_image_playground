const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/([^;,]+)(?:;base64)?,/i)
  const ext = match?.[1]?.split('+')[0]?.toLowerCase() ?? 'png'
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('无效的图片 Data URL')
  const header = dataUrl.slice(0, comma)
  const payload = dataUrl.slice(comma + 1)
  const isBase64 = header.toLowerCase().includes(';base64')
  if (isBase64) {
    const binary = atob(payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return { ext, bytes }
  }
  return { ext, bytes: new TextEncoder().encode(decodeURIComponent(payload)) }
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (!dataUrl.startsWith('data:') || comma < 0) throw new Error('无效的图片 Data URL')
  const header = dataUrl.slice(5, comma)
  const payload = dataUrl.slice(comma + 1)
  const separator = header.indexOf(';')
  const mime = separator < 0 ? header : header.slice(0, separator)
  if (!mime) throw new Error('图片 MIME 类型缺失')
  const isBase64 = header.toLowerCase().includes(';base64')
  let bytes: Uint8Array
  if (isBase64) {
    const binary = atob(payload)
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload))
  }
  return new Blob([bytes], { type: mime })
}

export function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mime = IMAGE_MIME_BY_EXTENSION[ext] ?? 'image/png'
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

export async function blobToDataUrl(blob: Blob, fallbackMime = 'application/octet-stream'): Promise<string> {
  return `data:${blob.type || fallbackMime};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`
}

export function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file, file.type || 'application/octet-stream')
}
