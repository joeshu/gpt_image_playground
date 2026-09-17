import { createInputImageFromFile } from '../../store'
import { getImage, getStoredImageBlob } from '../db'
import { validateImageFile } from '../imageUploadValidation'
import { createPptxPageId, PPTX_MAX_SOURCE_PAGES, type PptxSourcePage } from './model'

function readDimensions(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片无法读取，请选择有效的图片文件')) }
    image.src = url
  })
}

export async function ingestPptxFiles(files: File[], existingCount = 0): Promise<PptxSourcePage[]> {
  if (existingCount + files.length > PPTX_MAX_SOURCE_PAGES) {
    throw new Error(`最多支持 ${PPTX_MAX_SOURCE_PAGES} 页，请减少选择的图片数量`)
  }
  const pages: PptxSourcePage[] = []
  for (const file of files) {
    if (!/^image\/(png|jpeg|gif|bmp)$/.test(file.type)) throw new Error(`“${file.name}”不是支持的图片格式`)
    const { width, height } = await validateImageFile(file)
    const stored = await createInputImageFromFile(file)
    if (!stored) throw new Error(`“${file.name}”保存失败`)
    pages.push({ id: createPptxPageId(), imageId: stored.id, name: file.name || '未命名图片', mimeType: file.type, bytes: file.size, width, height, addedAt: Date.now() })
  }
  return pages
}

export async function ingestPptxImageId(imageId: string, name = '图片'): Promise<PptxSourcePage> {
  const [image, blob] = await Promise.all([getImage(imageId), getStoredImageBlob(imageId)])
  if (!image) throw new Error('找不到已保存的图片')
  const source = blob ?? (image.dataUrl ? await (await fetch(image.dataUrl)).blob() : undefined)
  if (!source) throw new Error('已保存图片没有可用数据')
  const { width, height } = await readDimensions(source)
  return { id: createPptxPageId(), imageId, name, mimeType: source.type || image?.imageBlob?.type || 'image/png', bytes: source.size, width, height, addedAt: Date.now() }
}

export async function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}
