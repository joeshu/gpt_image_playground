const KEYBOARD_OPEN_THRESHOLD = 80

function resetHorizontalViewport() {
  const root = document.documentElement
  const top = window.scrollY
  window.scrollTo({ left: 0, top, behavior: 'auto' })
  root.scrollLeft = 0
  document.body.scrollLeft = 0
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
    root.style.setProperty('--visual-viewport-height', `${window.innerHeight}px`)
    root.style.setProperty('--keyboard-inset', '0px')
    return
  }

  let frame = 0
  let focusTimer = 0

  const update = () => {
    window.cancelAnimationFrame(frame)
    frame = window.requestAnimationFrame(() => {
      const keyboardInset = calculateKeyboardInset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      )

      root.style.setProperty('--visual-viewport-height', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`)
      root.classList.toggle('ios-keyboard-open', keyboardInset >= KEYBOARD_OPEN_THRESHOLD)
      if (keyboardInset < KEYBOARD_OPEN_THRESHOLD) {
        resetHorizontalViewport()
        // iOS may commit the keyboard dismissal one or two frames after the
        // visualViewport resize event. Repeat the correction after that
        // commit so a fixed drawer cannot leave the app horizontally shifted.
        window.requestAnimationFrame(() => {
          resetHorizontalViewport()
          window.requestAnimationFrame(resetHorizontalViewport)
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
    window.setTimeout(resetHorizontalViewport, 0)
    window.setTimeout(resetHorizontalViewport, 180)
    window.setTimeout(resetHorizontalViewport, 420)
  })
  update()
}
