import { describe, expect, it } from 'vitest'
import { inspectPngAlphaDataUrl } from './pngAlpha'

const mixed = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAEElEQVR42mNgQAf/wQgNAAAnAAH/E3dOVQAAAABJRU5ErkJggg=='
const opaque = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEUlEQVR42mP4z8DwH4QZYAwAR8oH+Rq28akAAAAASUVORK5CYII='

describe('PNG alpha inspection', () => {
  it('detects visible content with transparent corners', () => {
    expect(inspectPngAlphaDataUrl(mixed)).toMatchObject({
      width: 2,
      height: 2,
      hasVisiblePixels: true,
      hasTransparentPixels: true,
      cornersTransparent: true,
    })
  })

  it('rejects opaque assets at the asset gate', () => {
    expect(inspectPngAlphaDataUrl(opaque)).toMatchObject({
      hasVisiblePixels: true,
      hasTransparentPixels: false,
      cornersTransparent: false,
    })
  })

  it('rejects malformed data URLs', () => {
    expect(() => inspectPngAlphaDataUrl('data:image/png;base64,not-a-png')).toThrow()
  })
})
