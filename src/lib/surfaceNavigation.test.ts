import { describe, expect, it, vi } from 'vitest'
import { resetSurfaceScroll } from './surfaceNavigation'

describe('surface navigation', () => {
  it('resets stale page scroll after the next surface renders', () => {
    const scrollTo = vi.fn()
    const scheduled: FrameRequestCallback[] = []
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduled.push(callback)
      return 1
    })

    resetSurfaceScroll({ requestAnimationFrame, scrollTo })

    expect(scrollTo).not.toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalledOnce()
    scheduled[0]?.(0)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2)
    scheduled[1]?.(0)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' })
  })
})
