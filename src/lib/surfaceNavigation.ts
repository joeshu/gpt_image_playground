export type SurfaceScrollWindow = Pick<Window, 'requestAnimationFrame' | 'scrollTo'>

export function resetSurfaceScroll(target: SurfaceScrollWindow = window) {
  // iOS WebView may apply the new surface visibility after the first frame.
  // Reset on the following frame so hidden-page scroll is never retained.
  target.requestAnimationFrame(() => {
    target.requestAnimationFrame(() => {
      target.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      if (typeof document !== 'undefined') {
        document.documentElement.scrollLeft = 0
        document.body.scrollLeft = 0
      }
    })
  })
}
