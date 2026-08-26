export type SurfaceScrollWindow = Pick<Window, 'requestAnimationFrame' | 'scrollTo'>

export function resetSurfaceScroll(target: SurfaceScrollWindow = window) {
  target.requestAnimationFrame(() => {
    target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  })
}
