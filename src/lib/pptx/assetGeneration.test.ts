import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApiProfile } from '../../types'
import type { PptxSlideSpec } from './model'

const { callBatchImageSingle, removeKeyedBackgroundFromDataUrl } = vi.hoisted(() => ({
  callBatchImageSingle: vi.fn(),
  removeKeyedBackgroundFromDataUrl: vi.fn(),
}))

vi.mock('../agentApi', () => ({ callBatchImageSingle }))
vi.mock('../transparentImage', () => ({
  buildTransparentPrompt: (prompt: string) => `KEYED:${prompt}`,
  removeKeyedBackgroundFromDataUrl,
}))
vi.mock('./pngAlpha', () => ({
  inspectPngAlphaDataUrl: (value: string) => ({
    width: 2, height: 2, hasVisiblePixels: true,
    hasTransparentPixels: value.includes('alpha'), cornersTransparent: value.includes('alpha'),
  }),
}))

import { generatePptxImagegenAssets } from './assetGeneration'

const profile: ApiProfile = {
  id: 'test', name: 'Test', provider: 'openai', baseUrl: 'https://api.example.com/v1',
  apiKey: 'test', model: 'model', timeout: 30, apiMode: 'responses',
  codexCli: false, apiProxy: false, transparentBackgroundMethod: 'api',
}

const spec: PptxSlideSpec = {
  schemaVersion: 1, canvas: { widthPx: 1200, heightPx: 675, aspectRatio: 16 / 9 },
  elements: [
    { id: 'title', type: 'text', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.05 }, text: 'Title' },
    { id: 'icon', type: 'image', box: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 }, classification: 'imagegen_asset', assetId: 'icon', assetPrompt: 'simple isolated red icon' },
  ], readingOrder: ['title', 'icon'], warnings: [],
}

const success = (value = 'data:image/png;base64,alpha') => ({ batchItemId: 'icon', image: { dataUrl: value }, error: null })

beforeEach(() => {
  callBatchImageSingle.mockReset()
  callBatchImageSingle.mockResolvedValue(success())
  removeKeyedBackgroundFromDataUrl.mockReset().mockResolvedValue('data:image/png;base64,alpha')
})

describe('PPTX imagegen transparency fallback', () => {
  it('retries only when native transparency is unsupported, then removes the keyed background locally', async () => {
    callBatchImageSingle
      .mockResolvedValueOnce({ batchItemId: 'icon', image: null, error: 'Transparent background is not supported for this model.' })
      .mockResolvedValueOnce(success('data:image/png;base64,keyed'))

    const result = await generatePptxImagegenAssets({ spec, profile })

    expect(callBatchImageSingle).toHaveBeenCalledTimes(2)
    expect(callBatchImageSingle.mock.calls[0][0]).toMatchObject({ transparentBackground: true })
    expect(callBatchImageSingle.mock.calls[1][0]).toMatchObject({ transparentBackground: false, prompt: expect.stringContaining('KEYED:') })
    expect(removeKeyedBackgroundFromDataUrl).toHaveBeenCalledWith('data:image/png;base64,keyed', undefined, 'png')
    expect(result.assets.icon).toBe('data:image/png;base64,alpha')
  })

  it('does not switch transparency mode for unrelated failures', async () => {
    callBatchImageSingle.mockResolvedValueOnce({ batchItemId: 'icon', image: null, error: 'rate limit exceeded' })
    await expect(generatePptxImagegenAssets({ spec, profile })).rejects.toThrow('rate limit exceeded')
    expect(callBatchImageSingle).toHaveBeenCalledOnce()
    expect(removeKeyedBackgroundFromDataUrl).not.toHaveBeenCalled()
  })
})
