export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:'
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
