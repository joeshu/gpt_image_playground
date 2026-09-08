import { describe, expect, it } from 'vitest'
import { blobToDataUrl, bytesToDataUrl, dataUrlToBlob, dataUrlToBytes } from './dataUrl'

describe('dataUrl helpers', () => {
  it('converts image data URLs to bytes with extension', () => {
    const result = dataUrlToBytes('data:image/png;base64,AQID')

    expect(result.ext).toBe('png')
    expect(Array.from(result.bytes)).toEqual([1, 2, 3])
  })

  it('converts bytes to image data URLs from file extension', () => {
    expect(bytesToDataUrl(new Uint8Array([1, 2, 3]), 'images/output.webp')).toBe('data:image/webp;base64,AQID')
  })

  it('converts blobs to data URLs with fallback MIME', async () => {
    await expect(blobToDataUrl(new Blob([new Uint8Array([1, 2, 3])]), 'image/png')).resolves.toBe('data:image/png;base64,AQID')
  })

  it('converts base64 and URL-encoded data URLs to blobs', async () => {
    const base64Blob = dataUrlToBlob('data:image/png;base64,AQID')
    expect(base64Blob.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await base64Blob.arrayBuffer()))).toEqual([1, 2, 3])

    const textBlob = dataUrlToBlob('data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E')
    expect(textBlob.type).toBe('image/svg+xml')
    await expect(textBlob.text()).resolves.toBe('<svg></svg>')
  })
})
