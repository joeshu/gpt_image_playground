export type PromptVersionSource = 'original' | 'enhanced' | 'generated' | 'restored'

export interface PromptVersion {
  id: string
  prompt: string
  source: PromptVersionSource
  createdAt: number
  enhancementLevel?: 'faithful' | 'balanced' | 'professional'
}

export interface PromptVersionDiff {
  prefix: string
  removed: string
  added: string
  suffix: string
}

const STORAGE_KEY = 'gpt-image-playground-prompt-versions'
const MAX_VERSIONS = 50
export const PROMPT_VERSIONS_CHANGED_EVENT = 'prompt-versions-changed'

function createVersionId() {
  return globalThis.crypto?.randomUUID?.() ?? `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function normalizePromptVersions(value: unknown): PromptVersion[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
    const source = ['original', 'enhanced', 'generated', 'restored'].includes(String(record.source))
      ? record.source as PromptVersionSource
      : null
    if (!prompt || !source) return []
    return [{
      id: typeof record.id === 'string' && record.id ? record.id : createVersionId(),
      prompt,
      source,
      createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : Date.now(),
      enhancementLevel: ['faithful', 'balanced', 'professional'].includes(String(record.enhancementLevel))
        ? record.enhancementLevel as PromptVersion['enhancementLevel']
        : undefined,
    }]
  }).sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_VERSIONS)
}

export function loadPromptVersions(): PromptVersion[] {
  try {
    return normalizePromptVersions(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
  } catch {
    return []
  }
}

export function savePromptVersion(input: Omit<PromptVersion, 'id' | 'createdAt'>): PromptVersion {
  const versions = loadPromptVersions()
  const existing = versions[0]
  if (existing?.prompt === input.prompt.trim() && existing.source === input.source) return existing

  const version: PromptVersion = {
    ...input,
    id: createVersionId(),
    prompt: input.prompt.trim(),
    createdAt: Date.now(),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([version, ...versions].slice(0, MAX_VERSIONS)))
  window.dispatchEvent(new CustomEvent(PROMPT_VERSIONS_CHANGED_EVENT))
  return version
}

export function removePromptVersion(id: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loadPromptVersions().filter((version) => version.id !== id)))
  window.dispatchEvent(new CustomEvent(PROMPT_VERSIONS_CHANGED_EVENT))
}

export function clearPromptVersions() {
  localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new CustomEvent(PROMPT_VERSIONS_CHANGED_EVENT))
}

export function getPromptVersionDiff(before: string, after: string): PromptVersionDiff {
  let prefixLength = 0
  const maxPrefix = Math.min(before.length, after.length)
  while (prefixLength < maxPrefix && before[prefixLength] === after[prefixLength]) prefixLength += 1

  let suffixLength = 0
  const maxSuffix = Math.min(before.length - prefixLength, after.length - prefixLength)
  while (
    suffixLength < maxSuffix
    && before[before.length - 1 - suffixLength] === after[after.length - 1 - suffixLength]
  ) suffixLength += 1

  return {
    prefix: before.slice(0, prefixLength),
    removed: before.slice(prefixLength, before.length - suffixLength || undefined),
    added: after.slice(prefixLength, after.length - suffixLength || undefined),
    suffix: suffixLength ? before.slice(before.length - suffixLength) : '',
  }
}
