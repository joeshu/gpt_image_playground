import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPromptVersions,
  getPromptVersionDiff,
  loadPromptVersions,
  normalizePromptVersions,
  savePromptVersion,
} from './promptVersionHistory'

describe('prompt version history', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes, sorts, and rejects invalid records', () => {
    expect(normalizePromptVersions([
      { id: 'older', prompt: '旧版本', source: 'original', createdAt: 1 },
      { id: 'newer', prompt: '新版本', source: 'enhanced', createdAt: 2 },
      { prompt: '', source: 'generated', createdAt: 3 },
    ]).map((version) => version.id)).toEqual(['newer', 'older'])
  })

  it('saves versions locally and deduplicates consecutive identical records', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100)
    const first = savePromptVersion({ prompt: '积分明白卡', source: 'original' })
    const repeated = savePromptVersion({ prompt: '积分明白卡', source: 'original' })
    savePromptVersion({ prompt: '积分明白卡，高端商务风格', source: 'enhanced', enhancementLevel: 'balanced' })

    expect(repeated.id).toBe(first.id)
    expect(loadPromptVersions()).toHaveLength(2)
    expect(loadPromptVersions()[0]).toMatchObject({ source: 'enhanced', enhancementLevel: 'balanced' })

    clearPromptVersions()
    expect(loadPromptVersions()).toEqual([])
  })

  it('creates a compact changed segment for comparison', () => {
    expect(getPromptVersionDiff('联通红海报，横版', '联通红商业海报，横版')).toEqual({
      prefix: '联通红',
      removed: '',
      added: '商业',
      suffix: '海报，横版',
    })
  })
})
