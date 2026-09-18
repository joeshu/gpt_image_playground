import { describe, expect, it } from 'vitest'
import { parsePptxSemanticSpec } from './semanticAnalysis'

const page = { width: 1672, height: 941 }

describe('PPTX semantic analysis protocol', () => {
  it('accepts JSON SlideSpec, keeps native objects, and removes full-page image fallback', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      schemaVersion: 1,
      canvas: { widthPx: 1672, heightPx: 941 },
      background: { color: '#FFFFFF' },
      elements: [
        { id: 'title', type: 'text', box: { x: 0.05, y: 0.03, width: 0.4, height: 0.06 }, text: '可编辑标题', confidence: 0.96 },
        { id: 'card', type: 'shape', shape: 'roundRect', box: { x: 0.05, y: 0.2, width: 0.3, height: 0.2 }, fill: '#FFF1F2', confidence: 0.92 },
        { id: 'full-page', type: 'image', box: { x: 0, y: 0, width: 1, height: 1 }, sourceBox: { x: 0, y: 0, width: 1, height: 1 }, classification: 'source_crop' },
        { id: 'logo', type: 'image', box: { x: 0.82, y: 0.02, width: 0.1, height: 0.08 }, sourceBox: { x: 0.82, y: 0.02, width: 0.1, height: 0.08 }, classification: 'source_crop', confidence: 0.9 },
      ],
      readingOrder: ['title'],
    }), page)
    expect(result.nativeElementCount).toBe(2)
    expect(result.sourceAssetCount).toBe(1)
    expect(result.spec.elements.some((element) => element.id === 'full-page')).toBe(false)
    expect(result.spec.warnings.some((warning) => warning.includes('整页'))).toBe(true)
  })

  it('falls back an unresolved asset to a small source crop', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      canvas: { widthPx: 1672, heightPx: 941 },
      elements: [
        { id: 'label', type: 'text', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, text: '标签' },
        { id: 'icon', type: 'image', box: { x: 0.2, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset', confidence: 0.4 },
      ],
    }), page)
    const icon = result.spec.elements[0]
    expect(icon?.type).toBe('image')
    expect(icon && icon.type === 'image' ? icon.classification : undefined).toBe('source_crop')
    expect(result.spec.warnings.some((warning) => warning.includes('已回退'))).toBe(true)
  })

  it('rejects a response without a usable element', () => {
    expect(() => parsePptxSemanticSpec('{"elements":[]}', page)).toThrow('没有产出可用元素')
    expect(() => parsePptxSemanticSpec('not json', page)).toThrow('JSON')
  })
})
