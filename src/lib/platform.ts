import { Capacitor } from '@capacitor/core'

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  return Capacitor.isNativePlatform()
    || window.location.protocol === 'capacitor:'
    || window.location.protocol === 'ionic:'
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return Capacitor.getPlatform() === 'ios'
    || /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}
