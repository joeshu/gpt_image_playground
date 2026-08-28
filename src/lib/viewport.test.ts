import { describe, expect, it } from 'vitest'
import { calculateKeyboardInset, getVisualViewportMetrics } from './viewport'

describe('getVisualViewportMetrics', () => {
  it('keeps fixed mobile controls aligned to the visual viewport', () => {
    expect(getVisualViewportMetrics({ offsetLeft: 18.4, offsetTop: 24.2, width: 390 }, 430)).toEqual({
      left: 18.4,
      top: 24.2,
      width: 390,
    })
  })

  it('falls back to the layout width for invalid viewport metrics', () => {
    expect(getVisualViewportMetrics({ offsetLeft: Number.NaN, offsetTop: -4, width: Number.NaN }, 430)).toEqual({
      left: 0,
      top: 0,
      width: 430,
    })
  })
})

describe('calculateKeyboardInset', () => {
  it('returns the obscured keyboard height', () => {
    expect(calculateKeyboardInset(844, 510, 0)).toBe(334)
  })

  it('accounts for a shifted visual viewport', () => {
    expect(calculateKeyboardInset(844, 510, 24)).toBe(310)
  })

  it('never returns a negative or non-finite inset', () => {
    expect(calculateKeyboardInset(600, 700, 0)).toBe(0)
    expect(calculateKeyboardInset(Number.NaN, 500, 0)).toBe(0)
  })
})
