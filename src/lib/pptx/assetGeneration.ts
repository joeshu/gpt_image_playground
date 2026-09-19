import { callBatchImageSingle } from '../agentApi'
import { DEFAULT_PARAMS, type ApiProfile } from '../../types'
import type { PptxSlideSpec } from './model'
import { listPptxImagegenAssets, type PptxImagegenAssetRequest } from './semanticAnalysis'
import { buildTransparentPrompt, removeKeyedBackgroundFromDataUrl } from '../transparentImage'
import { inspectPngAlphaDataUrl } from './pngAlpha'

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

function transparentAssetPrompt(request: PptxImagegenAssetRequest, allowKeyedBackground = false): string {
  return [
    allowKeyedBackground
      ? `Create exactly one isolated presentation asset named ${request.assetId} on a flat key-color background.`
      : `Create exactly one isolated transparent PNG asset named ${request.assetId}.`,
    'This asset will be inserted into an editable PowerPoint slide.',
    allowKeyedBackground
      ? 'Use exactly one flat key-color background selected by the final background instructions in this prompt. Fill the entire square canvas uniformly with that color for local transparency removal.'
      : 'Use a genuine alpha channel: transparent corners and transparent space around the subject.',
    allowKeyedBackground
      ? 'Do not draw any text, Chinese characters, labels, numbers, card frame, page background decoration, or shadow unless the prompt explicitly asks for a visible shadow.'
      : 'Do not draw any text, Chinese characters, labels, numbers, card frame, page background, or shadow unless the prompt explicitly asks for a visible shadow.',
    'Preserve the requested flat presentation color roles and simple geometry; do not invent a different palette.',
    request.prompt,
  ].join(' ')
}

function isNativeTransparencyUnsupported(error: string | null): boolean {
  return /transparent background is not supported for this model/i.test(error ?? '')
}

export function validateTransparentPngDataUrl(dataUrl: string): void {
  const inspection = inspectPngAlphaDataUrl(dataUrl)
  if (!inspection.hasVisiblePixels) throw new Error('生成的 PNG alpha 区域为空')
  if (!inspection.hasTransparentPixels || !inspection.cornersTransparent) {
    throw new Error('生成的 PNG 没有透明边界，拒绝作为独立资产')
  }
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
  let useLocalKeyedBackground = false
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
      prompt: useLocalKeyedBackground
        ? buildTransparentPrompt(transparentAssetPrompt(request, true))
        : transparentAssetPrompt(request),
      referenceImageDataUrls: [],
      allowPromptRewrite: false,
      signal: options.signal,
      transparentBackground: !useLocalKeyedBackground,
    })
    if (!result.image || result.error) {
      if (!useLocalKeyedBackground && isNativeTransparencyUnsupported(result.error)) {
        useLocalKeyedBackground = true
        index -= 1
        options.onProgress?.(`服务不支持原生透明背景，后续资产改用本地去背重试：${request.assetId}`)
        continue
      }
      throw new Error(`复杂资产 ${request.assetId} 生成失败：${result.error || '接口未返回图片'}`)
    }
    const dataUrl = useLocalKeyedBackground
      ? await removeKeyedBackgroundFromDataUrl(result.image.dataUrl, undefined, 'png')
      : result.image.dataUrl
    await validateTransparentPngDataUrl(dataUrl)
    assets[request.assetId] = dataUrl
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
