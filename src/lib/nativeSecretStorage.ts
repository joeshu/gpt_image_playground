import { registerPlugin } from '@capacitor/core'
import type { ApiProfile, AppSettings } from '../types'
import { normalizeSettings } from './apiProfiles'
import { isNativeApp } from './platform'

interface SecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>
  set(options: { key: string, value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

const SecureStorage = registerPlugin<SecureStoragePlugin>('SecureStorage')
let nativeSecretStorageReady = false

function getProfileSecretKey(profileId: string) {
  return `api-profile:${profileId}`
}

export function redactApiProfiles(profiles: ApiProfile[]): ApiProfile[] {
  return profiles.map((profile) => profile.apiKey ? { ...profile, apiKey: '' } : profile)
}

export function redactSettingsApiKeys(settings: AppSettings): AppSettings {
  return {
    ...settings,
    apiKey: '',
    profiles: redactApiProfiles(settings.profiles),
  }
}

export function shouldRedactPersistedApiKeys() {
  return isNativeApp() && nativeSecretStorageReady
}

export async function hydrateNativeApiKeys(settings: AppSettings): Promise<AppSettings> {
  if (!isNativeApp()) return settings

  const normalized = normalizeSettings(settings)
  const profiles: ApiProfile[] = []
  for (const profile of normalized.profiles) {
    const legacyApiKey = profile.apiKey || (profile.id === normalized.activeProfileId ? normalized.apiKey : '')
    if (legacyApiKey) {
      await SecureStorage.set({ key: getProfileSecretKey(profile.id), value: legacyApiKey })
      profiles.push({ ...profile, apiKey: legacyApiKey })
      continue
    }

    const stored = await SecureStorage.get({ key: getProfileSecretKey(profile.id) })
    profiles.push(stored.value ? { ...profile, apiKey: stored.value } : profile)
  }

  const activeApiKey = profiles.find((profile) => profile.id === normalized.activeProfileId)?.apiKey ?? ''
  return normalizeSettings({ ...normalized, apiKey: activeApiKey, profiles })
}

export async function persistNativeApiKeys(settings: AppSettings, removedProfileIds: string[] = []) {
  if (!isNativeApp() || !nativeSecretStorageReady) return

  for (const profileId of removedProfileIds) {
    await SecureStorage.remove({ key: getProfileSecretKey(profileId) })
  }

  const normalized = normalizeSettings(settings)
  for (const profile of normalized.profiles) {
    const key = getProfileSecretKey(profile.id)
    if (profile.apiKey) await SecureStorage.set({ key, value: profile.apiKey })
    else await SecureStorage.remove({ key })
  }
}

export function markNativeSecretStorageReady() {
  nativeSecretStorageReady = true
}

export function getApiKeySignature(settings: AppSettings) {
  return settings.profiles.map((profile) => [profile.id, profile.apiKey])
}
