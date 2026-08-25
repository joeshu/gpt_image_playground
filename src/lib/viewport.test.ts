import { describe, expect, it } from 'vitest'
import { calculateKeyboardInset } from './viewport'

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
