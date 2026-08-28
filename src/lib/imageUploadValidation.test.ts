import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_DIMENSION, validateDecodedImageSize } from './imageUploadValidation'

describe('image upload validation', () => {
  it('accepts valid decoded dimensions', () => {
    expect(() => validateDecodedImageSize(2048, 2048)).not.toThrow()
  })

  it('rejects invalid and oversized decoded dimensions', () => {
    expect(() => validateDecodedImageSize(0, 100)).toThrow('图片尺寸无效')
    expect(() => validateDecodedImageSize(MAX_UPLOAD_DIMENSION + 1, 100)).toThrow('图片分辨率过高')
  })
})
