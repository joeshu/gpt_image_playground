import { describe, expect, it } from 'vitest'
import { createUnicomOperationsGoldenSpec } from './goldenFixture'
import type { PptxSlideElement } from './model'

const isImageElement = (element: PptxSlideElement): element is Extract<PptxSlideElement, { type: 'image' }> => element.type === 'image'

describe('China Unicom semantic golden fixture', () => {
  it('contains native text, chart geometry, and only local image fallbacks', () => {
    const spec = createUnicomOperationsGoldenSpec()
    expect(spec.canvas).toEqual({ widthPx: 1672, heightPx: 941, aspectRatio: 1672 / 941 })
    expect(spec.elements.filter((element) => element.type === 'text').length).toBeGreaterThan(20)
    expect(spec.elements.some((element) => element.type === 'line' && element.id === 'blue-segment-1')).toBe(true)
    expect(spec.elements.some((element) => element.type === 'shape' && element.shape === 'ellipse')).toBe(true)
    expect(spec.elements.filter(isImageElement).every((element) => element.box.width < 0.5 && element.box.height < 0.5)).toBe(true)
    expect(spec.elements.some((element) => element.type === 'image' && element.classification === 'imagegen_asset')).toBe(true)
    expect(spec.elements.filter(isImageElement).every((element) => element.classification !== 'source_crop' || element.sourceExact === true)).toBe(true)
    expect(spec.elements.filter(isImageElement).every((element) => element.classification !== 'imagegen_asset' || Boolean(element.assetId && element.assetPrompt))).toBe(true)
    expect(spec.elements.some((element) => element.type === 'image' && element.box.width * element.box.height >= 0.78)).toBe(false)
  })
})
