import { unzipSync } from 'fflate'
import { zipFilesAsync } from '../asyncZip'
import {
  getPptxSlideSize,
  normalizePptxOptions,
  normalizeSlideSpec,
  type PptxElementBox,
  type PptxProjectOptions,
  type PptxSlideElement,
  type PptxSlideSpec,
  type PptxSourcePage,
  type PptxSlideSize,
} from './model'

/** Anything that can be losslessly turned into the bytes of an image. */
export type PptxImageSource = Blob | Uint8Array | ArrayBuffer | string
export type PptxPageWithImage = PptxSourcePage & {
  /** Optional convenience fields for callers that keep the image beside metadata. */
  blob?: Blob
  dataUrl?: string
  data?: PptxImageSource
}

export interface PptxPackageInput {
  pages: PptxSourcePage[] | PptxPageWithImage[]
  options?: Partial<PptxProjectOptions>
  /** Image bytes keyed by page.imageId (or page.id as a fallback). */
  images?: Record<string, PptxImageSource | undefined>
  /** Optional semantic layer, indexed by source-page order. */
  slideSpecs?: PptxSlideSpec[]
  /** Independent media used by user_asset/imagegen_asset elements. */
  assets?: Record<string, PptxImageSource>
  imageSources?: Record<string, PptxImageSource | undefined>
  /** Used when images are in IndexedDB or another application store. */
  resolveImage?: (page: PptxSourcePage) => PptxImageSource | Promise<PptxImageSource>
  createdAt?: Date
}

export interface PptxPackage {
  /** A browser-downloadable, standards-compliant OOXML package. */
  blob: Blob
  /** The exact bytes used to create blob (useful for tests and Capacitor). */
  bytes: Uint8Array
  /** Sorted package paths, including all relationship and metadata parts. */
  entries: string[]
  slideSize: PptxSlideSize
}

interface ImagePart { bytes: Uint8Array; contentType: string; extension: 'png' | 'jpg' | 'jpeg' | 'gif' | 'bmp' }

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  cp: 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
}
const EMU_PER_INCH = 914400
const PT_TO_EMU = 12700
const PX_PER_INCH = 96

const xml = (value: string): string => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' })[char]!)
const u8 = (value: string): Uint8Array => new TextEncoder().encode(value)
const hex = (value: string | undefined, fallback = 'FFFFFF'): string => {
  const candidate = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : fallback
  return candidate.toUpperCase()
}
const rel = (id: string, type: string, target: string): string => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
const contentType = (extension: string, type: string): string => `<Default Extension="${extension}" ContentType="${type}"/>`

function dataUrl(value: string): { mime: string; bytes: Uint8Array } | null {
  const match = value.match(/^data:([^;,\s]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  const payload = match[3] || ''
  if (match[2]) {
    const binary = typeof atob === 'function' ? atob(payload) : decodeBase64(payload)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return { mime, bytes }
  }
  return { mime, bytes: u8(decodeURIComponent(payload.replace(/\+/g, ' '))) }
}

function decodeBase64(value: string): string {
  // Browser path uses atob. This fallback is deliberately small and avoids a Node dependency.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '')
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
}

/** Resolve Blob/Data URL/typed bytes without ever putting base64 in the ZIP. */
export async function resolvePptxImageSource(source: PptxImageSource): Promise<{ mime: string; bytes: Uint8Array }> {
  if (typeof source === 'string') {
    const parsed = dataUrl(source)
    if (parsed) return parsed
    throw new Error('PPTX 图片字符串必须是 data URL')
  }
  if (source instanceof Blob) return { mime: source.type || 'application/octet-stream', bytes: new Uint8Array(await source.arrayBuffer()) }
  if (source instanceof ArrayBuffer) return { mime: 'application/octet-stream', bytes: new Uint8Array(source) }
  if (source instanceof Uint8Array) return { mime: 'application/octet-stream', bytes: new Uint8Array(source) }
  throw new Error('无法解析 PPTX 图片输入')
}

function imagePart(source: { mime: string; bytes: Uint8Array }, page: PptxSourcePage): ImagePart {
  let mime = source.mime.toLowerCase().split(';')[0] || page.mimeType.toLowerCase()
  const b = source.bytes
  if (mime === 'application/octet-stream') {
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) mime = 'image/png'
    else if (b[0] === 0xff && b[1] === 0xd8) mime = 'image/jpeg'
    else if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) mime = 'image/gif'
    else if (b[0] === 0x42 && b[1] === 0x4d) mime = 'image/bmp'
    else if (/^image\/(png|jpeg|jpg|gif|bmp)$/i.test(page.mimeType)) mime = page.mimeType.toLowerCase()
  }
  const known: Record<string, ImagePart['extension']> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' }
  const extension = known[mime]
  if (!extension) throw new Error(`PPTX 不支持的图片类型: ${mime}`)
  // PowerPoint accepts these raster formats in a blip; preserving source bytes is intentional.
  return { bytes: b, contentType: mime === 'image/jpg' ? 'image/jpeg' : mime, extension }
}

function imageSourceFor(page: PptxPageWithImage, input: PptxPackageInput): PptxImageSource | undefined {
  if (page.blob) return page.blob
  if (page.dataUrl) return page.dataUrl
  if (page.data) return page.data
  return input.images?.[page.imageId] ?? input.assets?.[page.imageId] ?? input.imageSources?.[page.imageId]
    ?? input.images?.[page.id] ?? input.assets?.[page.id] ?? input.imageSources?.[page.id]
}

function fitBox(page: PptxSourcePage, slide: PptxSlideSize, fit: 'contain' | 'cover'): { x: number; y: number; width: number; height: number } {
  const sw = slide.widthEmu
  const sh = slide.heightEmu
  const iw = Math.max(1, page.width)
  const ih = Math.max(1, page.height)
  const scale = fit === 'cover' ? Math.max(sw / iw, sh / ih) : Math.min(sw / iw, sh / ih)
  const width = Math.round(iw * scale)
  const height = Math.round(ih * scale)
  return { x: Math.round((sw - width) / 2), y: Math.round((sh - height) / 2), width, height }
}

function emu(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function signedEmu(value: number): number {
  return Number.isFinite(value) ? Math.round(value) : 0
}

function normalizedBox(value: PptxElementBox): PptxElementBox {
  const x = Math.min(1, Math.max(0, Number(value.x) || 0))
  const y = Math.min(1, Math.max(0, Number(value.y) || 0))
  const width = Math.min(1 - x, Math.max(0.001, Number(value.width) || 0.001))
  const height = Math.min(1 - y, Math.max(0.001, Number(value.height) || 0.001))
  return { x, y, width, height }
}

function boxToXfrm(value: PptxElementBox, slide: PptxSlideSize, rotation?: number, flipH = false, flipV = false): string {
  const box = normalizedBox(value)
  const rotate = typeof rotation === 'number' && Number.isFinite(rotation) && rotation !== 0 ? ` rot="${Math.round(rotation * 60000)}"` : ''
  const flips = `${flipH ? ' flipH="1"' : ''}${flipV ? ' flipV="1"' : ''}`
  return `<a:xfrm${rotate}${flips}><a:off x="${emu(box.x * slide.widthEmu)}" y="${emu(box.y * slide.heightEmu)}"/><a:ext cx="${emu(box.width * slide.widthEmu)}" cy="${emu(box.height * slide.heightEmu)}"/></a:xfrm>`
}

function fillXml(color: string | undefined): string {
  return color ? `<a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill>` : '<a:noFill/>'
}

function lineXml(color: string | undefined, widthPt = 1, headEnd?: string, tailEnd?: string): string {
  if (!color && !headEnd && !tailEnd) return '<a:ln><a:noFill/></a:ln>'
  const width = Math.min(12, Math.max(0.25, Number(widthPt) || 1))
  const head = headEnd ? `<a:headEnd type="${headEnd}" w="med" len="med"/>` : ''
  const tail = tailEnd ? `<a:tailEnd type="${tailEnd}" w="med" len="med"/>` : ''
  const stroke = color ? `<a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill><a:prstDash val="solid"/>` : '<a:noFill/>'
  return `<a:ln w="${emu(width * PT_TO_EMU)}">${stroke}${head}${tail}</a:ln>`
}

type ShapeElement = Extract<PptxSlideElement, { type: 'rect' | 'line' | 'shape' }>

function shapeXml(element: ShapeElement, slide: PptxSlideSize, shapeId: number): string {
  const isLine = element.type === 'line'
  const geometry = isLine
    ? 'line'
    : element.type === 'rect'
      ? (element.radius && element.radius > 0 ? 'roundRect' : 'rect')
      : element.shape
  const fill = isLine ? '<a:noFill/>' : fillXml(element.fill)
  const widthPt = element.type === 'rect' ? 1 : element.widthPt
  const line = lineXml(element.line, widthPt, element.type === 'line' ? element.headEnd : undefined, element.type === 'line' ? element.tailEnd : undefined)
  const rotation = element.type === 'shape' ? element.rotation : undefined
  const flipH = element.type === 'line' ? element.flipH : false
  const flipV = element.type === 'line' ? element.flipV : false
  return `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId}" name="${xml(element.id)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${boxToXfrm(element.box, slide, rotation, flipH, flipV)}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fill}${line}</p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></p:txBody></p:sp>`
}

function textXml(element: Extract<PptxSlideElement, { type: 'text' }>, slide: PptxSlideSize, shapeId: number): string {
  const style = element.style
  const family = xml(style?.fontFamily?.trim() || 'Aptos')
  const fontSize = Math.min(400, Math.max(1, Number(style?.fontSizePt) || 18))
  const color = hex(style?.color, '000000')
  const bold = style?.bold ? ' b="1"' : ''
  const italic = style?.italic ? ' i="1"' : ''
  const align = style?.align === 'center' ? 'ctr' : style?.align === 'right' ? 'r' : 'l'
  const anchor = style?.verticalAnchor === 'middle' ? 'ctr' : style?.verticalAnchor === 'bottom' ? 'b' : 't'
  const margin = Math.round((style?.marginPt ?? 0) * PT_TO_EMU)
  const runProps = `<a:rPr lang="zh-CN" sz="${Math.round(fontSize * 100)}"${bold}${italic}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${family}"/><a:ea typeface="${family}"/><a:cs typeface="${family}"/></a:rPr>`
  const paragraphs = xml(element.text).split('\n').map((part) => `<a:p><a:pPr algn="${align}"/><a:r>${runProps}<a:t xml:space="preserve">${part}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${Math.round(fontSize * 100)}"><a:latin typeface="${family}"/><a:ea typeface="${family}"/><a:cs typeface="${family}"/></a:endParaRPr></a:p>`).join('')
  const bodyPr = `<a:bodyPr wrap="square" anchor="${anchor}" marL="${margin}" marR="${margin}" marT="${margin}" marB="${margin}"/>`
  return `<p:sp><p:nvSpPr><p:cNvPr id="${shapeId}" name="${xml(element.id)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${boxToXfrm(element.box, slide)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody>${bodyPr}<a:lstStyle/>${paragraphs}</p:txBody></p:sp>`
}
function sourceCropXml(source: PptxElementBox | undefined): string {
  if (!source) return ''
  const box = normalizedBox(source)
  const left = Math.round(box.x * 100000)
  const top = Math.round(box.y * 100000)
  const right = Math.round((1 - box.x - box.width) * 100000)
  const bottom = Math.round((1 - box.y - box.height) * 100000)
  return `<a:srcRect l="${left}" t="${top}" r="${right}" b="${bottom}"/>`
}

function pictureXml(element: Extract<PptxSlideElement, { type: 'image' }>, slide: PptxSlideSize, relId: string, shapeId: number, name: string, overrideBox?: { x: number; y: number; width: number; height: number }): string {
  const xfrm = overrideBox
    ? `<a:xfrm><a:off x="${signedEmu(overrideBox.x)}" y="${signedEmu(overrideBox.y)}"/><a:ext cx="${emu(overrideBox.width)}" cy="${emu(overrideBox.height)}"/></a:xfrm>`
    : boxToXfrm(element.box, slide)
  return `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="${xml(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/>${sourceCropXml(element.sourceBox)}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

function coverSourceBox(page: PptxSourcePage, slide: PptxSlideSize): PptxElementBox | undefined {
  const sourceRatio = page.width / Math.max(1, page.height)
  if (!Number.isFinite(sourceRatio) || sourceRatio <= 0) return undefined
  if (sourceRatio > slide.ratio) {
    const width = slide.ratio / sourceRatio
    return { x: (1 - width) / 2, y: 0, width, height: 1 }
  }
  const height = sourceRatio / slide.ratio
  return { x: 0, y: (1 - height) / 2, width: 1, height }
}

/** Map analyzer coordinates (source-image space) into slide space without stretching. */
function mapSemanticBox(box: PptxElementBox, page: PptxSourcePage, slide: PptxSlideSize, fit: 'contain' | 'cover'): PptxElementBox | null {
  const fitted = fitBox(page, slide, fit)
  const content = {
    x: fitted.x / slide.widthEmu,
    y: fitted.y / slide.heightEmu,
    width: fitted.width / slide.widthEmu,
    height: fitted.height / slide.heightEmu,
  }
  const visibleSource = fit === 'cover' ? coverSourceBox(page, slide) : undefined
  const sourceBox = visibleSource ?? { x: 0, y: 0, width: 1, height: 1 }
  const left = Math.max(box.x, sourceBox.x)
  const top = Math.max(box.y, sourceBox.y)
  const right = Math.min(box.x + box.width, sourceBox.x + sourceBox.width)
  const bottom = Math.min(box.y + box.height, sourceBox.y + sourceBox.height)
  if (right <= left || bottom <= top) return null
  return {
    x: content.x + ((left - sourceBox.x) / sourceBox.width) * content.width,
    y: content.y + ((top - sourceBox.y) / sourceBox.height) * content.height,
    width: ((right - left) / sourceBox.width) * content.width,
    height: ((bottom - top) / sourceBox.height) * content.height,
  }
}

function mapSemanticElement(element: PptxSlideElement, page: PptxSourcePage, slide: PptxSlideSize, fit: 'contain' | 'cover'): PptxSlideElement | null {
  const box = mapSemanticBox(element.box, page, slide, fit)
  return box ? { ...element, box } : null
}

function slideXml(page: PptxSourcePage, slide: PptxSlideSize, options: PptxProjectOptions): string {
  const background = hex(options.backgroundColor)
  const cover = options.fit === 'cover'
  const image = { id: page.id, type: 'image' as const, box: { x: 0, y: 0, width: 1, height: 1 }, sourceBox: cover ? coverSourceBox(page, slide) : undefined, classification: 'source_crop' as const }
  const fitted = cover ? { x: 0, y: 0, width: slide.widthEmu, height: slide.heightEmu } : fitBox(page, slide, 'contain')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt x="0" y="0"/></a:xfrm></p:grpSpPr>${pictureXml(image, slide, 'rId2', 2, page.name || 'Image', fitted)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
}

interface PreparedSlideImages { source: ImagePart; assets: Record<string, ImagePart> }
interface SlidePackageData { xml: string; relationships: string; media: Array<{ path: string; image: ImagePart }> }

function semanticSlideData(page: PptxSourcePage, slide: PptxSlideSize, options: PptxProjectOptions, spec: PptxSlideSpec, prepared: PreparedSlideImages, slideNumber: number): SlidePackageData {
  const media: Array<{ path: string; image: ImagePart }> = []
  const rels: string[] = [rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', '../slideLayouts/slideLayout1.xml')]
  const assetRelIds = new Map<string, string>()
  let sourceRelId: string | undefined
  let nextRel = 2
  const imageRel = (element: Extract<PptxSlideElement, { type: 'image' }>): string | undefined => {
    if (element.classification === 'source_crop') {
      if (!sourceRelId) {
        sourceRelId = `rId${nextRel++}`
        rels.push(rel(sourceRelId, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `../media/slide${slideNumber}-source.${prepared.source.extension}`))
        media.push({ path: `ppt/media/slide${slideNumber}-source.${prepared.source.extension}`, image: prepared.source })
      }
      return sourceRelId
    }
    const assetId = element.assetId
    if (!assetId || !prepared.assets[assetId]) return undefined
    const existing = assetRelIds.get(assetId)
    if (existing) return existing
    const id = `rId${nextRel++}`
    const image = prepared.assets[assetId]
    const path = `ppt/media/slide${slideNumber}-asset${media.length + 1}.${image.extension}`
    assetRelIds.set(assetId, id)
    rels.push(rel(id, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `../media/slide${slideNumber}-asset${media.length + 1}.${image.extension}`))
    media.push({ path, image })
    return id
  }
  const mappedElements = spec.elements.flatMap((element) => {
    const mapped = mapSemanticElement(element, page, slide, options.fit)
    return mapped ? [mapped] : []
  })
  const elements = mappedElements.map((element, index) => {
    const shapeId = index + 2
    if (element.type === 'text') return textXml(element, slide, shapeId)
    if (element.type === 'rect' || element.type === 'line' || element.type === 'shape') return shapeXml(element, slide, shapeId)
    const relId = imageRel(element)
    return relId ? pictureXml(element, slide, relId, shapeId, element.id) : ''
  }).join('')
  const background = hex(spec.background?.color || options.backgroundColor)
  const xmlValue = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="${background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${elements}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  return { xml: xmlValue, relationships: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rels.join('')}</Relationships>`, media }
}

function slideLayoutXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}

function slideMasterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld name="Master"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`
}

function themeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="${NS.a}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme></a:themeElements></a:theme>`
}

function presentationXml(slide: PptxSlideSize, count: number): string {
  const slideIds = Array.from({ length: count }, (_, index) => `<p:sldId id="${256 + index}" r:id="rId${2 + index}"/>`).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${slide.widthEmu}" cy="${slide.heightEmu}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`
}

function packageParts(
  slide: PptxSlideSize,
  pages: PptxSourcePage[],
  options: PptxProjectOptions,
  images: ImagePart[],
  createdAt: Date,
  slideSpecs?: Array<PptxSlideSpec | undefined>,
  semanticAssets: Array<Record<string, ImagePart>> = [],
): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {}
  const put = (path: string, value: string) => { files[path] = u8(value) }
  const overrides = [
    ['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'],
    ['/ppt/slideMasters/slideMaster1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'],
    ['/ppt/slideLayouts/slideLayout1.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'],
    ...pages.map((_, i) => [`/ppt/slides/slide${i + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml']),
  ].map(([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`).join('')
  put('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS.ct}">${contentType('rels', 'application/vnd.openxmlformats-package.relationships+xml')}${contentType('xml', 'application/xml')}${contentType('png', 'image/png')}${contentType('jpg', 'image/jpeg')}${contentType('jpeg', 'image/jpeg')}${contentType('gif', 'image/gif')}${contentType('bmp', 'image/bmp')}${overrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`)
  put('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument', 'ppt/presentation.xml')}${rel('rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml')}${rel('rId3', 'http://schemas.openxmlformats.org/package/2006/relationships/extended-properties', 'docProps/app.xml')}</Relationships>`)
  put('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="${NS.cp}" xmlns:dc="${NS.dc}" xmlns:dcterms="${NS.dcterms}" xmlns:xsi="${NS.xsi}"><dc:title>${xml(options.fileName)}</dc:title><dc:creator>GPT Image Playground</dc:creator><cp:lastModifiedBy>GPT Image Playground</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${createdAt.toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt.toISOString()}</dcterms:modified></cp:coreProperties>`)
  put('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>GPT Image Playground</Application><AppVersion>1.0</AppVersion><PresentationFormat>Widescreen</PresentationFormat><Slides>${pages.length}</Slides><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><ScaleCrop>false</ScaleCrop></Properties>`)
  put('ppt/presentation.xml', presentationXml(slide, pages.length))
  put('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', 'slideMasters/slideMaster1.xml')}${pages.map((_, i) => rel(`rId${i + 2}`, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', `slides/slide${i + 1}.xml`)).join('')}${rel(`rId${pages.length + 2}`, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', 'theme/theme1.xml')}</Relationships>`)
  put('ppt/theme/theme1.xml', themeXml())
  put('ppt/slideMasters/slideMaster1.xml', slideMasterXml())
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', '../slideLayouts/slideLayout1.xml')}${rel('rId2', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme', '../theme/theme1.xml')}</Relationships>`)
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster', '../slideMasters/slideMaster1.xml')}</Relationships>`)
  pages.forEach((page, index) => {
    const n = index + 1
    const spec = slideSpecs?.[index]
    if (spec && spec.elements.length > 0) {
      const prepared: PreparedSlideImages = { source: images[index]!, assets: semanticAssets[index] || {} }
      const data = semanticSlideData(page, slide, options, spec, prepared, n)
      put(`ppt/slides/slide${n}.xml`, data.xml)
      put(`ppt/slides/_rels/slide${n}.xml.rels`, data.relationships)
      data.media.forEach((item) => { files[item.path] = item.image.bytes })
    } else {
      put(`ppt/slides/slide${n}.xml`, slideXml(page, slide, options))
      const imageName = `image${n}.${images[index]!.extension}`
      put(`ppt/slides/_rels/slide${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}">${rel('rId1', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout', '../slideLayouts/slideLayout1.xml')}${rel('rId2', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `../media/${imageName}`)}</Relationships>`)
      files[`ppt/media/${imageName}`] = images[index]!.bytes
    }
  })
  return files
}

/** Build raw package bytes. This is async only because Blob.arrayBuffer is async. */
export async function buildPptxBytes(input: PptxPackageInput): Promise<Uint8Array> {
  const pages = input.pages as PptxPageWithImage[]
  if (!pages.length) throw new Error('PPTX 至少需要一页图片')
  const options = normalizePptxOptions(input.options)
  const slide = getPptxSlideSize(options.aspectRatio, pages[0])
  const images: ImagePart[] = []
  for (const page of pages) {
    const source = imageSourceFor(page, input) ?? await input.resolveImage?.(page)
    if (!source) throw new Error(`找不到页面图片: ${page.imageId}`)
    images.push(imagePart(await resolvePptxImageSource(source), page))
  }
  // Normalize at the package boundary as callers may hydrate specs from JSON.
  // A missing/empty spec deliberately remains quick-pack compatible.
  const slideSpecs = input.slideSpecs?.map((spec, index) => spec
    ? normalizeSlideSpec(spec, pages[index] || pages[0]!)
    : undefined)
  const semanticAssets: Array<Record<string, ImagePart>> = []
  for (let index = 0; index < pages.length; index += 1) {
    const map: Record<string, ImagePart> = {}
    const spec = slideSpecs?.[index]
    if (spec?.elements.length) {
      const ids = new Set(spec.elements
        .filter((element): element is Extract<PptxSlideElement, { type: 'image' }> => element.type === 'image' && element.classification !== 'source_crop' && !!element.assetId)
        .map((element) => element.assetId!))
      for (const assetId of ids) {
        const source = input.assets?.[assetId] ?? input.images?.[assetId] ?? input.imageSources?.[assetId]
        if (source === undefined) {
          throw new Error(`语义图片资产缺失：${assetId}（页面 ${pages[index]!.name || pages[index]!.id}）`)
        }
        map[assetId] = imagePart(await resolvePptxImageSource(source), pages[index]!)
      }
    }
    semanticAssets.push(map)
  }
  const files = packageParts(slide, pages, options, images, input.createdAt ?? new Date(), slideSpecs, semanticAssets)
  return zipFilesAsync(files, 6)
}

export async function compilePptx(input: PptxPackageInput): Promise<PptxPackage> {
  const bytes = await buildPptxBytes(input)
  const entries = Object.keys(unzipSync(bytes)).sort()
  const options = normalizePptxOptions(input.options)
  const pages = input.pages as PptxSourcePage[]
  const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return { blob: new Blob([blobBytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), bytes, entries, slideSize: getPptxSlideSize(options.aspectRatio, pages[0]) }
}

/** Alias suited to download handlers. */
export const buildPptxPackage = compilePptx
export const createPptxPackage = compilePptx


export function calculatePptxImageBox(page: Pick<PptxSourcePage, 'width' | 'height'>, slide: PptxSlideSize, fit: 'contain' | 'cover') {
  return fitBox(page as PptxSourcePage, slide, fit)
}

export const pixelsToEmu = (pixels: number): number => Math.round(pixels / PX_PER_INCH * EMU_PER_INCH)
export const pointsToEmu = (points: number): number => Math.round(points * PT_TO_EMU)
