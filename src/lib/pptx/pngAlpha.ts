import { unzlibSync } from 'fflate'

export interface PngAlphaInspection {
  width: number
  height: number
  hasVisiblePixels: boolean
  hasTransparentPixels: boolean
  cornersTransparent: boolean
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function readU32(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) >>> 0
}

function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/\s/g, '')
  const binary = typeof atob === 'function'
    ? atob(clean)
    : (() => {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
        let output = ''
        for (let index = 0; index < clean.length; index += 4) {
          const a = alphabet.indexOf(clean[index] || 'A')
          const b = alphabet.indexOf(clean[index + 1] || 'A')
          const c = clean[index + 2] === '=' ? 0 : alphabet.indexOf(clean[index + 2] || 'A')
          const d = clean[index + 3] === '=' ? 0 : alphabet.indexOf(clean[index + 3] || 'A')
          output += String.fromCharCode((a << 2) | (b >> 4))
          if (clean[index + 2] !== '=') output += String.fromCharCode(((b & 15) << 4) | (c >> 2))
          if (clean[index + 3] !== '=') output += String.fromCharCode(((c & 3) << 6) | d)
        }
        return output
      })()
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function unfilter(raw: Uint8Array, width: number, height: number, bytesPerPixel: number, rowBytes: number): Uint8Array {
  const rows = new Uint8Array(height * rowBytes)
  let input = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[input++] ?? 0
    const rowOffset = y * rowBytes
    const previousOffset = (y - 1) * rowBytes
    for (let x = 0; x < rowBytes; x += 1) {
      const current = raw[input++] ?? 0
      const left = x >= bytesPerPixel ? rows[rowOffset + x - bytesPerPixel]! : 0
      const up = y > 0 ? rows[previousOffset + x]! : 0
      const upperLeft = y > 0 && x >= bytesPerPixel ? rows[previousOffset + x - bytesPerPixel]! : 0
      const value = filter === 0 ? current
        : filter === 1 ? (current + left) & 0xff
          : filter === 2 ? (current + up) & 0xff
            : filter === 3 ? (current + Math.floor((left + up) / 2)) & 0xff
              : filter === 4 ? (current + paeth(left, up, upperLeft)) & 0xff
                : NaN
      if (!Number.isFinite(value)) throw new Error(`PNG 使用了未知扫描线过滤器：${filter}`)
      rows[rowOffset + x] = value
    }
  }
  return rows
}

/** Inspect common 8-bit, non-interlaced PNG alpha without relying on canvas or DOM. */
export function inspectPngAlphaDataUrl(dataUrl: string): PngAlphaInspection {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i)
  if (!match) throw new Error('图片生成服务没有返回可解析的 PNG Data URL')
  const bytes = decodeBase64(match[1]!)
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('生成的 PNG 签名无效')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let palette: Uint8Array | undefined
  let transparency: Uint8Array | undefined
  const idat: Uint8Array[] = []
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset)
    const typeOffset = offset + 4
    const dataOffset = offset + 8
    const end = dataOffset + length
    if (end + 4 > bytes.length) throw new Error('PNG chunk 越界')
    const type = String.fromCharCode(bytes[typeOffset]!, bytes[typeOffset + 1]!, bytes[typeOffset + 2]!, bytes[typeOffset + 3]!)
    const data = bytes.slice(dataOffset, end)
    if (type === 'IHDR' && data.length >= 13) {
      width = readU32(data, 0)
      height = readU32(data, 4)
      bitDepth = data[8]!
      colorType = data[9]!
      interlace = data[12]!
    } else if (type === 'PLTE') palette = data
    else if (type === 'tRNS') transparency = data
    else if (type === 'IDAT') idat.push(data)
    offset = end + 4
    if (type === 'IEND') break
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0) throw new Error('仅支持 8-bit 非隔行 PNG 透明度校验')
  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 0 ? 1 : 0
  if (!channels || !idat.length) throw new Error(`不支持的 PNG 色彩类型：${colorType}`)
  const rowBytes = width * channels
  const decoded = unfilter(unzlibSync(concat(idat)), width, height, channels, rowBytes)
  const alphas = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const pixel = y * rowBytes + x * channels
      if (colorType === 6) alphas[index] = decoded[pixel + 3]!
      else if (colorType === 4) alphas[index] = decoded[pixel + 1]!
      else if (colorType === 3) alphas[index] = transparency?.[decoded[pixel]!] ?? 255
      else if (colorType === 0 && transparency && transparency.length >= 2) alphas[index] = decoded[pixel] === transparency[1] ? 0 : 255
      else if (colorType === 2 && transparency && transparency.length >= 6) alphas[index] = decoded[pixel] === transparency[1] && decoded[pixel + 1] === transparency[3] && decoded[pixel + 2] === transparency[5] ? 0 : 255
      else alphas[index] = 255
    }
  }
  const transparent = alphas.some((alpha) => alpha === 0)
  const visible = alphas.some((alpha) => alpha > 0)
  const corners = [0, width - 1, (height - 1) * width, height * width - 1].every((index) => (alphas[index] ?? 255) <= 8)
  return { width, height, hasVisiblePixels: visible, hasTransparentPixels: transparent, cornersTransparent: corners }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
