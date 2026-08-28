import type { AgentRound, TaskRecord } from '../types'
import { replaceImageMentionsForApi, stripImageMentionMarkers } from './promptImageMentions'

export interface AgentPromptImageReference {
  imageId: string
  /** 视觉模型看到的可追踪引用标签，例如 @第1轮图2。 */
  label: string
}

const AGENT_ROUND_IMAGE_REFERENCE_RE = /@(?:第)?(\d+)轮图(\d+)/g
const AGENT_REF_TAG_RE = /<ref\b[^>]*\bid=(["'])(round-(\d+)-(?:image|reference)-(\d+))\1[^>]*\/?>/g

export function getAgentCurrentReferenceId(round: AgentRound, index: number) {
  return `round-${round.index}-reference-${index + 1}`
}

export function getAgentGeneratedImageReferenceId(round: AgentRound, index: number) {
  return `round-${round.index}-image-${index + 1}`
}

export function getAgentReferenceTag(referenceId: string) {
  return `<ref id="${referenceId}" />`
}

export function getAgentRemovedReferenceTag(referenceId: string) {
  return `<removed_ref id="${referenceId}" />`
}

export function collectAgentRoundOutputImageSlots(round: AgentRound, tasks: TaskRecord[]) {
  const slots: Array<string | null> = []
  for (const taskId of round.outputTaskIds) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task) {
      slots.push(null)
      continue
    }
    slots.push(...task.outputImages)
  }
  return slots
}

export function extractAgentReferenceIds(text: string) {
  return Array.from(text.matchAll(AGENT_REF_TAG_RE), (match) => match[2]).filter((id): id is string => Boolean(id))
}

export function resolveAgentPromptImageReferences(prompt: string, rounds: AgentRound[], tasks: TaskRecord[]) {
  const refs: string[] = []
  for (const match of prompt.matchAll(AGENT_ROUND_IMAGE_REFERENCE_RE)) {
    const roundIndex = Number(match[1]) - 1
    const imageIndex = Number(match[2]) - 1
    const round = rounds[roundIndex]
    if (!round || imageIndex < 0) continue

    const imageId = collectAgentRoundOutputImageSlots(round, tasks)[imageIndex]
    if (imageId) refs.push(imageId)
  }
  return refs
}

/**
 * 将当前 Agent 提示词中的历史图片引用解析为去重后的图片条目。
 * 既保留首次出现顺序，也保留可展示给视觉模型的原始 @ 标签。
 */
export function resolveAgentPromptImageReferenceEntries(prompt: string, rounds: AgentRound[], tasks: TaskRecord[]): AgentPromptImageReference[] {
  const entries: AgentPromptImageReference[] = []
  const seenImageIds = new Set<string>()
  for (const match of prompt.matchAll(AGENT_ROUND_IMAGE_REFERENCE_RE)) {
    const roundIndex = Number(match[1]) - 1
    const imageIndex = Number(match[2]) - 1
    const round = rounds[roundIndex]
    if (!round || imageIndex < 0) continue

    const imageId = collectAgentRoundOutputImageSlots(round, tasks)[imageIndex]
    if (!imageId || seenImageIds.has(imageId)) continue
    seenImageIds.add(imageId)
    entries.push({
      imageId,
      label: stripImageMentionMarkers(match[0]),
    })
  }
  return entries
}

export function replaceAgentPromptImageReferencesForApi(
  prompt: string,
  currentRound: AgentRound,
  rounds: AgentRound[],
  tasks: TaskRecord[],
) {
  const withCurrentReferences = replaceImageMentionsForApi(
    prompt,
    currentRound.inputImageIds.length,
    (index) => getAgentReferenceTag(getAgentCurrentReferenceId(currentRound, index)),
  )

  const replaceGeneratedReference = (text: string, roundNumber: string, imageNumber: string) => {
    const roundIndex = Number(roundNumber) - 1
    const imageIndex = Number(imageNumber) - 1
    const sourceRound = rounds[roundIndex]
    if (!sourceRound || imageIndex < 0) return text

    const imageId = collectAgentRoundOutputImageSlots(sourceRound, tasks)[imageIndex]
    if (!imageId) return getAgentRemovedReferenceTag(getAgentGeneratedImageReferenceId(sourceRound, imageIndex))

    const currentReferenceIndex = currentRound.inputImageIds.indexOf(imageId)
    const referenceId = currentReferenceIndex >= 0
      ? getAgentCurrentReferenceId(currentRound, currentReferenceIndex)
      : getAgentGeneratedImageReferenceId(sourceRound, imageIndex)
    return getAgentReferenceTag(referenceId)
  }
  const withAgentReferences = withCurrentReferences.replace(AGENT_ROUND_IMAGE_REFERENCE_RE, replaceGeneratedReference)
  return stripImageMentionMarkers(withAgentReferences)
}
