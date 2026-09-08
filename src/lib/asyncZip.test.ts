import { describe, expect, it } from 'vitest'
import { strToU8, unzipSync } from 'fflate'
import { zipFilesAsync } from './asyncZip'

describe('zipFilesAsync', () => {
  it('preserves entry bytes through the fallback path', async () => {
    const result = await zipFilesAsync({
      'hello.txt': strToU8('hello'),
      'nested/world.txt': [strToU8('world'), { level: 0 }],
    })
    const files = unzipSync(result)
    expect(new TextDecoder().decode(files['hello.txt'])).toBe('hello')
    expect(new TextDecoder().decode(files['nested/world.txt'])).toBe('world')
  })
})
