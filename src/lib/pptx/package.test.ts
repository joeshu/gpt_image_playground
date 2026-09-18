import { describe, expect, it } from 'vitest'
import { unzipSync } from 'fflate'
import { getPptxSlideSize, validatePptxPages, PPTX_MAX_SOURCE_BYTES, type PptxSourcePage } from './model'
import {
  buildPptxBytes,
  calculatePptxImageBox,
  compilePptx,
  resolvePptxImageSource,
} from './package'

const page = (id: string, width = 1920, height = 1080): PptxSourcePage => ({
  id,
  imageId: id,
  name: `Page ${id}`,
  mimeType: 'image/png',
  bytes: 4,
  width,
  height,
  addedAt: 0,
})

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])

// These tests intentionally stay at pure package/source level: no browser UI or app store.
describe('PPTX package compiler', () => {
  it('resolves Blob and DataURL to binary bytes', async () => {
    await expect(resolvePptxImageSource(new Blob([png], { type: 'image/png' }))).resolves.toMatchObject({ mime: 'image/png', bytes: png })
    await expect(resolvePptxImageSource('data:image/png;base64,iVBORwECAwQ=')).resolves.toMatchObject({ mime: 'image/png' })
  })

  it('contains standard OOXML parts, one media part per page, and original bytes', async () => {
    const bytes = await buildPptxBytes({ pages: [page('one'), page('two')], images: { one: png, two: png } })
    const files = unzipSync(bytes)
    const names = Object.keys(files)
    expect(names).toEqual(expect.arrayContaining([
      '[Content_Types].xml', '_rels/.rels', 'docProps/core.xml', 'docProps/app.xml',
      'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels', 'ppt/theme/theme1.xml',
      'ppt/slideMasters/slideMaster1.xml', 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      'ppt/slideLayouts/slideLayout1.xml', 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml',
      'ppt/slides/_rels/slide1.xml.rels', 'ppt/slides/_rels/slide2.xml.rels',
      'ppt/media/image1.png', 'ppt/media/image2.png',
    ]))
    expect(Array.from(files['ppt/media/image1.png']!)).toEqual(Array.from(png))
    expect(new TextDecoder().decode(files['ppt/slides/slide1.xml'])).toContain('r:embed="rId2"')
  })

  it('supports contain and cover geometry and aspect ratios', () => {
    const slide = getPptxSlideSize('16:9', page('x'))
    const contain = calculatePptxImageBox(page('x', 1000, 2000), slide, 'contain')
    const cover = calculatePptxImageBox(page('x', 1000, 2000), slide, 'cover')
    expect(contain.width).toBeLessThan(slide.widthEmu)
    expect(contain.x).toBeGreaterThan(0)
    expect(cover.width).toBe(slide.widthEmu)
    expect(cover.height).toBeGreaterThan(slide.heightEmu)
    expect(getPptxSlideSize('4:3').ratio).toBeCloseTo(4 / 3)
    expect(getPptxSlideSize('source', page('x', 1000, 500)).ratio).toBe(2)
  })

  it('returns a Blob, sorted verifiable entry list, and custom background', async () => {
    const result = await compilePptx({
      pages: [page('x')], images: { x: png },
      options: { backgroundColor: '#102030', fit: 'contain', aspectRatio: '4:3', fileName: 'Demo' },
    })
    expect(result.blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
    expect(result.entries).toEqual([...result.entries].sort())
    const files = unzipSync(result.bytes)
    expect(new TextDecoder().decode(files['ppt/slides/slide1.xml'])).toContain('val="102030"')
    expect(new TextDecoder().decode(files['ppt/presentation.xml'])).toContain(`cx="${result.slideSize.widthEmu}"`)
  })

  it('rejects empty or oversized page inputs before packaging', () => {
    expect(validatePptxPages([])).toContain('请至少添加一张图片')
    expect(validatePptxPages([{ ...page('large'), bytes: PPTX_MAX_SOURCE_BYTES + 1 }]).some((issue) => issue.includes('超过单张'))).toBe(true)
  })

  it('escapes XML-sensitive page names', async () => {
    const bytes = await buildPptxBytes({ pages: [{ ...page('xml'), name: 'A & <B> "C"' }], images: { xml: png } })
    const files = unzipSync(bytes)
    const slide = new TextDecoder().decode(files['ppt/slides/slide1.xml'])
    expect(slide).toContain('A &amp; &lt;B&gt; &quot;C&quot;')
  })
})
