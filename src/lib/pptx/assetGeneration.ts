import { callBatchImageSingle } from '../agentApi'
import { DEFAULT_PARAMS, type ApiProfile } from '../../types'
import type { PptxSlideSpec } from './model'
import { listPptxImagegenAssets, type PptxImagegenAssetRequest } from './semanticAnalysis'

export interface PptxGeneratedAssetManifestEntry {
  assetId: string
  prompt: string
  elementIds: string[]
  status: 'generated'
  mimeType: 'image/png'
  transparentBackgroundRequested: true
  alphaValidation: 'passed'
}

export interface PptxGeneratedAssetsResult {
  assets: Record<string, string>
  manifest: PptxGeneratedAssetManifestEntry[]
}

function transparentAssetPrompt(request: PptxImagegenAssetRequest): string {
  return [
    `Create exactly one isolated transparent PNG asset named ${request.assetId}.`,
    'This asset will be inserted into an editable PowerPoint slide.',
    'Use a genuine alpha channel: transparent corners and transparent space around the subject.',
    'Do not draw any text, Chinese characters, labels, numbers, card frame, page background, or shadow unless the prompt explicitly asks for a visible shadow.',
    'Preserve the requested flat presentation color roles and simple geometry; do not invent a different palette.',
    request.prompt,
  ].join(' ')
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('生成的 PNG 无法解码'))
    image.src = dataUrl
  })
}

/** Validate the alpha contract required by the image-to-PPTX skill. */
export async function validateTransparentPngDataUrl(dataUrl: string): Promise<void> {
  if (!/^data:image\/png(?:;|,)/i.test(dataUrl)) throw new Error('图片生成服务没有返回 PNG 透明资产')
  if (typeof document === 'undefined' || typeof Image === 'undefined') return
  const image = await loadImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, image.naturalWidth || image.width)
  canvas.height = Math.max(1, image.naturalHeight || image.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法读取生成资产的 alpha 通道')
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let opaque = 0
  let transparent = 0
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] === 0) transparent += 1
    if (pixels[index] > 0) opaque += 1
  }
  if (!opaque) throw new Error('生成的 PNG alpha 区域为空')
  if (!transparent) throw new Error('生成的 PNG 没有透明区域，拒绝作为独立资产')
}

export async function generatePptxImagegenAssets(options: {
  spec: PptxSlideSpec
  profile: ApiProfile
  signal?: AbortSignal
  onProgress?: (message: string) => void
}): Promise<PptxGeneratedAssetsResult> {
  if (options.profile.apiMode !== 'responses') {
    throw new Error('复杂图片资产生成需要支持 Responses API 的 Agent 图片配置')
  }
  const requests = listPptxImagegenAssets(options.spec)
  const assets: Record<string, string> = {}
  const manifest: PptxGeneratedAssetManifestEntry[] = []
  const params = {
    ...DEFAULT_PARAMS,
    size: '1024x1024',
    quality: 'high' as const,
    output_format: 'png' as const,
    transparent_output: true,
    n: 1,
  }

  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index]!
    options.onProgress?.(`正在生成复杂资产 ${index + 1}/${requests.length}：${request.assetId}`)
    const result = await callBatchImageSingle({
      profile: options.profile,
      params,
      batchItemId: request.assetId,
      prompt: transparentAssetPrompt(request),
      referenceImageDataUrls: [],
      allowPromptRewrite: false,
      signal: options.signal,
      transparentBackground: true,
    })
    if (!result.image || result.error) {
      throw new Error(`复杂资产 ${request.assetId} 生成失败：${result.error || '接口未返回图片'}`)
    }
    await validateTransparentPngDataUrl(result.image.dataUrl)
    assets[request.assetId] = result.image.dataUrl
    manifest.push({
      assetId: request.assetId,
      prompt: request.prompt,
      elementIds: request.elementIds,
      status: 'generated',
      mimeType: 'image/png',
      transparentBackgroundRequested: true,
      alphaValidation: 'passed',
    })
  }

  return { assets, manifest }
}
