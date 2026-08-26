import { describe, expect, it } from 'vitest'
import { clampImagePan, getImagePanBounds } from './imageViewerGeometry'

describe('image viewer geometry', () => {
  it('locks pan at the fitted scale', () => {
    expect(getImagePanBounds(800, 600, 390, 844, 1)).toEqual({ maxX: 0, maxY: 0 })
  })

  it('allows only the enlarged overflow plus the recovery margin', () => {
    expect(getImagePanBounds(300, 500, 390, 844, 2, 24)).toEqual({ maxX: 129, maxY: 102 })
  })

  it('clamps translation so an enlarged image cannot be lost off-screen', () => {
    expect(clampImagePan(180, 120)).toBe(120)
    expect(clampImagePan(-180, 120)).toBe(-120)
    expect(clampImagePan(40, 120)).toBe(40)
  })
})
