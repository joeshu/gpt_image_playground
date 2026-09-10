import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './imageApiShared'

describe('getApiErrorMessage', () => {
  it('normalizes Cloudflare 524 HTML', async () => {
    const response = new Response('<!doctype html><title>524: A timeout occurred</title>', {
      status: 524,
      headers: { 'content-type': 'text/html' },
    })
    await expect(getApiErrorMessage(response)).resolves.toBe(
      '上游 API 处理超时（HTTP 524）。附件可能过大，请减少附件大小或改用较小文件后重试。',
    )
  })

  it('extracts structured provider errors', async () => {
    const response = new Response(JSON.stringify({
      success: false,
      errors: [{ code: 524, message: 'A timeout occurred' }],
    }), { status: 524, headers: { 'content-type': 'application/json' } })
    await expect(getApiErrorMessage(response)).resolves.toBe('A timeout occurred')
  })
})
