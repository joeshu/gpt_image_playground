import { describe, expect, it } from 'vitest'
import { getAdjacentImageIds } from './imageViewerPreload'

describe('image viewer adjacent preload', () => {
  it('preloads both neighbors and wraps at the list edge', () => {
    expect(getAdjacentImageIds(['a', 'b', 'c'], 'a')).toEqual(['c', 'b'])
    expect(getAdjacentImageIds(['a', 'b', 'c'], 'c')).toEqual(['b', 'a'])
  })

  it('does not request the same neighbor twice in a two-image list', () => {
    expect(getAdjacentImageIds(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('ignores a single image or an unknown current image', () => {
    expect(getAdjacentImageIds(['a'], 'a')).toEqual([])
    expect(getAdjacentImageIds(['a', 'b'], 'missing')).toEqual([])
  })
})
