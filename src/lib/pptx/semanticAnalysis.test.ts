import { describe, expect, it } from 'vitest'
import { listPptxImagegenAssets, namespacePptxImagegenAssetIds, parsePptxSemanticSpec } from './semanticAnalysis'

const page = { width: 1672, height: 941 }

describe('PPTX semantic analysis protocol', () => {
  it('accepts native objects and exact user-supplied brand crops', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      schemaVersion: 1,
      canvas: { widthPx: 1672, heightPx: 941 },
      background: { color: '#FFFFFF' },
      elements: [
        { id: 'title', type: 'text', box: { x: 0.05, y: 0.03, width: 0.4, height: 0.06 }, text: '可编辑标题', confidence: 0.96 },
        { id: 'card', type: 'shape', shape: 'roundRect', box: { x: 0.05, y: 0.2, width: 0.3, height: 0.2 }, fill: '#FFF1F2', confidence: 0.92 },
        { id: 'logo', type: 'image', box: { x: 0.82, y: 0.02, width: 0.1, height: 0.08 }, sourceBox: { x: 0.82, y: 0.02, width: 0.1, height: 0.08 }, classification: 'source_crop', sourceExact: true, confidence: 0.9 },
      ],
      readingOrder: ['title'],
    }), page)
    expect(result.nativeElementCount).toBe(2)
    expect(result.sourceAssetCount).toBe(1)
    expect(result.spec.elements.some((element) => element.id === 'logo' && element.type === 'image' && element.sourceExact)).toBe(true)
  })

  it('accepts compact w/h geometry returned by vision models', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      canvas: { widthPx: 1200, heightPx: 675 },
      elements: [
        { id: 'title-short-box', type: 'text', box: { x: 0.06, y: 0.02, w: 0.35, h: 0.06 }, text: '聚焦流失三大根因', confidence: 0.99 },
        { id: 'divider-short-box', type: 'line', box: { x: 0.39, y: 0.79, w: 0.02, h: 0.04 }, line: '#D6A4A7' },
        { id: 'icon-short-box', type: 'image', box: { x: 0.1, y: 0.2, w: 0.08, h: 0.08 }, classification: 'imagegen_asset', assetId: 'chart-icon', assetPrompt: 'isolated transparent red chart icon' },
      ],
    }), page)
    expect(result.nativeElementCount).toBe(2)
    expect(result.sourceAssetCount).toBe(1)
    expect(result.spec.elements[0]).toMatchObject({ type: 'text', box: { x: 0.06, y: 0.02, width: 0.35, height: 0.06 } })
  })

  it('requires generated image assets to carry a stable prompt and manifest entry', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      canvas: { widthPx: 1672, heightPx: 941 },
      elements: [
        { id: 'label', type: 'text', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, text: '标签' },
        { id: 'icon', type: 'image', box: { x: 0.2, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset', assetId: 'icon', assetPrompt: 'red isolated transparent target icon', confidence: 0.4 },
        { id: 'icon-copy', type: 'image', box: { x: 0.4, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset', assetId: 'icon', assetPrompt: 'red isolated transparent target icon', confidence: 0.4 },
      ],
    }), page)
    const assets = listPptxImagegenAssets(result.spec)
    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({ assetId: 'icon', prompt: 'red isolated transparent target icon', elementIds: ['icon', 'icon-copy'] })
  })

  it('namespaces generated asset IDs without breaking same-page reuse', () => {
    const result = parsePptxSemanticSpec(JSON.stringify({
      elements: [
        { id: 'label', type: 'text', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, text: '标签' },
        { id: 'icon', type: 'image', box: { x: 0.2, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset', assetId: 'icon', assetPrompt: 'red icon' },
        { id: 'icon-copy', type: 'image', box: { x: 0.4, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset', assetId: 'icon', assetPrompt: 'red icon' },
      ],
    }), page)
    const namespaced = namespacePptxImagegenAssetIds(result.spec, 'slide-2')
    expect(namespaced.elements.filter((element) => element.type === 'image').map((element) => element.type === 'image' ? element.assetId : undefined)).toEqual(['slide-2-icon', 'slide-2-icon'])
  })

  it('rejects full-page crops and incomplete generated assets', () => {
    expect(() => parsePptxSemanticSpec(JSON.stringify({
      elements: [
        { id: 'full-page', type: 'image', box: { x: 0, y: 0, width: 1, height: 1 }, sourceBox: { x: 0, y: 0, width: 1, height: 1 }, classification: 'source_crop', sourceExact: true },
        { id: 'title', type: 'text', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, text: '标题' },
      ],
    }), page)).toThrow('覆盖范围过大')
    expect(() => parsePptxSemanticSpec(JSON.stringify({
      elements: [{ id: 'icon', type: 'image', box: { x: 0.2, y: 0.2, width: 0.06, height: 0.06 }, classification: 'imagegen_asset' }],
    }), page)).toThrow('缺少 assetId 或 assetPrompt')
    expect(() => parsePptxSemanticSpec('{"elements":[]}', page)).toThrow('没有产出可用元素')
    expect(() => parsePptxSemanticSpec('not json', page)).toThrow('JSON')
  })
})
