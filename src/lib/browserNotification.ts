import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isNativeApp } from './platform'

export type BrowserNotificationPermission = NotificationPermission | 'unsupported'
export type BrowserNotificationPermissionResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'denied' | 'default' | 'error'; error?: unknown }
export type NotificationTarget = { actionId?: string; taskId?: string; conversationId?: string }
export type BrowserNotificationReadiness =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'denied' | 'default' }

interface NativeNotificationsPlugin {
  getPermission(): Promise<{ permission: 'granted' | 'denied' | 'default' }>
  requestPermission(): Promise<{ permission: 'granted' | 'denied' | 'default' }>
  notify(options: { title: string; body: string; taskId?: string; conversationId?: string }): Promise<void>
  getPendingAction(): Promise<NotificationTarget>
  clearPendingAction(): Promise<void>
  addListener(eventName: 'notificationAction', listener: (target: NotificationTarget) => void): Promise<PluginListenerHandle>
}

const NativeNotifications = registerPlugin<NativeNotificationsPlugin>('NativeNotifications')

function getNotificationConstructor() {
  if (typeof window === 'undefined' || !('Notification' in window)) return null
  return window.Notification
}

function isSecureNotificationContext() {
  return typeof window !== 'undefined' && window.isSecureContext
}

export function getBrowserNotificationReadiness(): BrowserNotificationReadiness {
  if (isNativeApp()) return { ok: true }
  const NotificationConstructor = getNotificationConstructor()
  if (!NotificationConstructor) return { ok: false, reason: 'unsupported' }
  if (!isSecureNotificationContext()) return { ok: false, reason: 'insecure' }
  if (NotificationConstructor.permission === 'granted') return { ok: true }
  return { ok: false, reason: NotificationConstructor.permission }
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionResult> {
  if (isNativeApp()) {
    try {
      const current = await NativeNotifications.getPermission()
      if (current.permission === 'granted') return { ok: true }
      if (current.permission === 'denied') return { ok: false, reason: 'denied' }
      const requested = await NativeNotifications.requestPermission()
      return requested.permission === 'granted'
        ? { ok: true }
        : { ok: false, reason: requested.permission }
    } catch (error) {
      return { ok: false, reason: 'error', error }
    }
  }

  const readiness = getBrowserNotificationReadiness()
  if (readiness.ok || readiness.reason !== 'default') return readiness

  try {
    const permission = await window.Notification.requestPermission()
    if (permission === 'granted') return { ok: true }
    if (permission === 'denied') return { ok: false, reason: 'denied' }
    return { ok: false, reason: 'default' }
  } catch (error) {
    return { ok: false, reason: 'error', error }
  }
}

export async function subscribeNotificationActions(listener: (target: NotificationTarget) => void) {
  const handleWebAction = (event: Event) => listener((event as CustomEvent<NotificationTarget>).detail)
  window.addEventListener('task-notification-action', handleWebAction)
  if (!isNativeApp()) return () => window.removeEventListener('task-notification-action', handleWebAction)

  let lastActionId = ''
  const handleAction = (target: NotificationTarget) => {
    if (!target.taskId && !target.conversationId) return
    if (target.actionId && target.actionId === lastActionId) return
    lastActionId = target.actionId ?? ''
    listener(target)
    void NativeNotifications.clearPendingAction().catch((error) => {
      console.warn('Failed to clear pending notification action:', error)
    })
  }
  const handle = await NativeNotifications.addListener('notificationAction', handleAction)
  const pending = await NativeNotifications.getPendingAction()
  handleAction(pending)
  return () => {
    window.removeEventListener('task-notification-action', handleWebAction)
    void handle.remove()
  }
}

export function showBrowserNotification(title: string, options?: NotificationOptions, target: NotificationTarget = {}) {
  if (isNativeApp()) {
    void NativeNotifications.notify({ title, body: options?.body ?? '', ...target }).catch((error) => {
      console.warn('Native task notification failed:', error)
    })
    return true
  }

  const NotificationConstructor = getNotificationConstructor()
  if (!NotificationConstructor || !isSecureNotificationContext() || NotificationConstructor.permission !== 'granted') return false

  try {
    const notification = new NotificationConstructor(title, {
      tag: 'task-completion',
      requireInteraction: false,
      ...options,
    })
    notification.onclick = () => {
      window.focus()
      window.dispatchEvent(new CustomEvent('task-notification-action', { detail: target }))
      notification.close()
    }
    return true
  } catch {
    return false
  }
}
