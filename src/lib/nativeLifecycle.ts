import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativeApp } from './platform'

interface NativeLifecyclePlugin {
  addListener(
    eventName: 'appStateChange',
    listenerFunc: (state: { isActive: boolean }) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'memoryWarning',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
}

const NativeLifecycle = registerPlugin<NativeLifecyclePlugin>('NativeLifecycle')

export async function subscribeNativeLifecycle(options: {
  onResume: () => void
  onPause: () => void
  onMemoryWarning?: () => void
}) {
  if (!isNativeApp()) return () => {}

  const handles = await Promise.all([
    NativeLifecycle.addListener('appStateChange', ({ isActive }) => {
      if (isActive) options.onResume()
      else options.onPause()
    }),
    NativeLifecycle.addListener('memoryWarning', () => options.onMemoryWarning?.()),
  ])

  return () => {
    for (const handle of handles) void handle.remove()
  }
}
