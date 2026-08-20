import { describe, expect, it } from 'vitest'
import { getNetworkErrorKind } from './imageApiShared'

describe('getNetworkErrorKind', () => {
  it('识别常见网络请求失败', () => {
    expect(getNetworkErrorKind(new TypeError('Failed to fetch'))).toBe('network')
    expect(getNetworkErrorKind(new TypeError('Network request failed'))).toBe('network')
  })

  it('识别请求中断', () => {
    expect(getNetworkErrorKind(new DOMException('Aborted', 'AbortError'))).toBe('aborted')
  })

  it('识别请求超时', () => {
    expect(getNetworkErrorKind(new DOMException('Timeout', 'TimeoutError'))).toBe('timeout')
  })

  it('忽略业务错误', () => {
    expect(getNetworkErrorKind(new Error('HTTP 500'))).toBeNull()
  })
})
