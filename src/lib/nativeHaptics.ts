import { registerPlugin } from '@capacitor/core'
import { isNativeApp } from './platform'

type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error'

interface NativeHapticsPlugin {
  selection(): Promise<void>
  impact(options: { style: 'light' | 'medium' }): Promise<void>
  notification(options: { type: 'success' | 'warning' | 'error' }): Promise<void>
}

const NativeHaptics = registerPlugin<NativeHapticsPlugin>('NativeHaptics')

export async function playNativeHaptic(kind: HapticKind) {
  if (!isNativeApp()) return
  try {
    if (kind === 'selection') await NativeHaptics.selection()
    else if (kind === 'light' || kind === 'medium') await NativeHaptics.impact({ style: kind })
    else await NativeHaptics.notification({ type: kind })
  } catch (error) {
    console.warn('Native haptic feedback failed:', error)
  }
}

export function installNativeHaptics() {
  if (!isNativeApp()) return

  document.addEventListener('pointerup', (event) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-haptic]')
      : null
    const kind = target?.dataset.haptic as HapticKind | undefined
    if (!kind) return
    void playNativeHaptic(kind)
  }, { passive: true })
}
