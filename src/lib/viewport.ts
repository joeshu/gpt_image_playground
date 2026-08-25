const KEYBOARD_OPEN_THRESHOLD = 80

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
    })
  }

  const revealFocusedControl = () => {
    window.clearTimeout(focusTimer)
    focusTimer = window.setTimeout(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return
      if (!active.matches('input, textarea, [contenteditable="true"]')) return
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    }, 180)
  }

  viewport.addEventListener('resize', update)
  viewport.addEventListener('scroll', update)
  window.addEventListener('orientationchange', update)
  document.addEventListener('focusin', revealFocusedControl)
  update()
}
