const KEYBOARD_OPEN_THRESHOLD = 80

function finiteViewportMetric(value: number | undefined, fallback = 0) {
  return Number.isFinite(value) ? Math.max(0, value as number) : fallback
}

export function getVisualViewportMetrics(
  viewport: Pick<VisualViewport, 'offsetLeft' | 'offsetTop' | 'width'>,
  fallbackWidth: number,
) {
  return {
    left: finiteViewportMetric(viewport.offsetLeft),
    top: finiteViewportMetric(viewport.offsetTop),
    width: finiteViewportMetric(viewport.width, finiteViewportMetric(fallbackWidth)),
  }
}

function syncVisualViewportVariables(viewport: VisualViewport | null) {
  const root = document.documentElement
  if (!viewport) {
    root.style.setProperty('--visual-viewport-left', '0px')
    root.style.setProperty('--visual-viewport-top', '0px')
    root.style.setProperty('--visual-viewport-width', '100%')
    return
  }

  const metrics = getVisualViewportMetrics(viewport, window.innerWidth)
  root.style.setProperty('--visual-viewport-left', `${Math.round(metrics.left)}px`)
  root.style.setProperty('--visual-viewport-top', `${Math.round(metrics.top)}px`)
  root.style.setProperty('--visual-viewport-width', `${Math.round(metrics.width)}px`)
}

function resetHorizontalViewport(viewport: VisualViewport | null = window.visualViewport) {
  const root = document.documentElement
  const top = window.scrollY
  window.scrollTo({ left: 0, top, behavior: 'auto' })
  root.scrollLeft = 0
  document.body.scrollLeft = 0
  syncVisualViewportVariables(viewport)
}

export function calculateKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  visualOffsetTop = 0,
) {
  if (![layoutHeight, visualHeight, visualOffsetTop].every(Number.isFinite)) return 0
  return Math.max(0, Math.round(layoutHeight - visualHeight - visualOffsetTop))
}

export function installMobileViewportGuards() {
  const viewport = window.visualViewport
  const root = document.documentElement
  if (!viewport) {
    syncVisualViewportVariables(null)
    root.style.setProperty('--visual-viewport-height', `${window.innerHeight}px`)
    root.style.setProperty('--keyboard-inset', '0px')
    return
  }

  let frame = 0
  let focusTimer = 0

  const update = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      syncVisualViewportVariables(viewport)
      const keyboardInset = calculateKeyboardInset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      )

      root.style.setProperty('--visual-viewport-height', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`)
      root.classList.toggle('ios-keyboard-open', keyboardInset >= KEYBOARD_OPEN_THRESHOLD)
      if (keyboardInset < KEYBOARD_OPEN_THRESHOLD) {
        resetHorizontalViewport(viewport)
        // iOS may commit the keyboard dismissal one or two frames after the
        // visualViewport resize event. Repeat the correction after that
        // commit so a fixed drawer cannot leave the app horizontally shifted.
        window.requestAnimationFrame(() => {
          resetHorizontalViewport(viewport)
          window.requestAnimationFrame(() => resetHorizontalViewport(viewport))
        })
      }
    })
  }

  const revealFocusedControl = () => {
    window.clearTimeout(focusTimer)
    focusTimer = window.setTimeout(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      if (!active.matches('input, textarea, [contenteditable="true"]')) return
      // Inputs inside fixed sheets/drawers must not call scrollIntoView on the
      // document: iOS can preserve the resulting horizontal offset after the
      // keyboard is dismissed and shift the entire app off-screen.
      if (active.closest('[data-agent-sidebar], [data-input-bar]')) return
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }, 180)
  }

  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  window.addEventListener('orientationchange', update)
  document.addEventListener('focusin', revealFocusedControl)
  document.addEventListener('focusout', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (!target.closest('[data-agent-sidebar]')) return
    window.setTimeout(() => resetHorizontalViewport(viewport), 0)
    window.setTimeout(() => resetHorizontalViewport(viewport), 180)
    window.setTimeout(() => resetHorizontalViewport(viewport), 420)
  })
  viewport.addEventListener('scrollend', () => {
    if (!root.classList.contains('ios-keyboard-open')) resetHorizontalViewport(viewport)
  })
  update()
}
