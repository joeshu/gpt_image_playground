import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { redactApiProfiles, redactSettingsApiKeys } from './nativeSecretStorage'

describe('native secret redaction', () => {
  it('removes API keys without changing profile identity or other fields', () => {
    const profiles = DEFAULT_SETTINGS.profiles.map((profile, index) => ({
      ...profile,
      apiKey: index === 0 ? 'secret-key' : '',
    }))
    const redacted = redactApiProfiles(profiles)

    expect(redacted[0].apiKey).toBe('')
    expect(redacted[0].id).toBe(profiles[0].id)
    expect(redacted[0].baseUrl).toBe(profiles[0].baseUrl)
  })

  it('removes both legacy and profile API keys from persisted settings', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      apiKey: 'legacy-secret',
      profiles: DEFAULT_SETTINGS.profiles.map((profile) => ({ ...profile, apiKey: 'profile-secret' })),
    }
    const redacted = redactSettingsApiKeys(settings)

    expect(redacted.apiKey).toBe('')
    expect(redacted.profiles.every((profile) => profile.apiKey === '')).toBe(true)
    expect(redacted.activeProfileId).toBe(settings.activeProfileId)
  })
})
