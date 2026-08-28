import type { AgentConversation, AgentInputDraft, InputImage, MaskDraft, StoredImage, StoredImageThumbnail, TaskRecord } from '../types'
import { deleteImage, getAllImages, getAllImageThumbnails } from './db'
import { clearImageCaches } from './imageCache'

export interface StorageReferenceState {
  tasks: TaskRecord[]
  agentConversations: AgentConversation[]
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
  galleryInputDraft: AgentInputDraft | null
  agentInputDrafts: Record<string, AgentInputDraft>
}

export interface AppStorageUsage {
  imageCount: number
  imageBytes: number
  thumbnailCount: number
  thumbnailBytes: number
  orphanCount: number
  orphanBytes: number
}

function addId(ids: Set<string>, id?: string | null) {
  if (id) ids.add(id)
}

function addDraftIds(ids: Set<string>, draft?: AgentInputDraft | null) {
  if (!draft) return
  draft.inputImages.forEach((image) => ids.add(image.id))
  addId(ids, draft.maskDraft?.targetImageId)
  addId(ids, draft.maskEditorImageId)
}

export function collectReferencedImageIds(state: StorageReferenceState) {
  const ids = new Set<string>()
  state.inputImages.forEach((image) => ids.add(image.id))
  addId(ids, state.maskDraft?.targetImageId)
  addId(ids, state.maskEditorImageId)
  addDraftIds(ids, state.galleryInputDraft)
  Object.values(state.agentInputDrafts).forEach((draft) => addDraftIds(ids, draft))

  state.tasks.forEach((task) => {
    task.inputImageIds.forEach((id) => ids.add(id))
    task.outputImages.forEach((id) => ids.add(id))
    task.transparentOriginalImages?.forEach((id) => ids.add(id))
    task.streamPartialImageIds?.forEach((id) => ids.add(id))
    addId(ids, task.maskTargetImageId)
    addId(ids, task.maskImageId)
  })

  state.agentConversations.forEach((conversation) => {
    conversation.rounds.forEach((round) => {
      round.inputImageIds.forEach((id) => ids.add(id))
      addId(ids, round.maskTargetImageId)
      addId(ids, round.maskImageId)
    })
    conversation.messages.forEach((message) => {
      message.inputImageIds?.forEach((id) => ids.add(id))
      addId(ids, message.maskTargetImageId)
      addId(ids, message.maskImageId)
    })
  })

  return ids
}

export function getDataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) return new TextEncoder().encode(dataUrl).byteLength
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  if (!header.includes(';base64')) return new TextEncoder().encode(decodeURIComponent(body)).byteLength
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((body.length * 3) / 4) - padding)
}

export function calculateAppStorageUsage(images: StoredImage[], thumbnails: StoredImageThumbnail[], referencedIds: Set<string>): AppStorageUsage {
  const imageBytes = images.reduce((total, image) => total + getDataUrlBytes(image.dataUrl), 0)
  const thumbnailBytes = thumbnails.reduce((total, thumbnail) => total + getDataUrlBytes(thumbnail.thumbnailDataUrl), 0)
  const imageSizes = new Map(images.map((image) => [image.id, getDataUrlBytes(image.dataUrl)]))
  const thumbnailSizes = new Map(thumbnails.map((thumbnail) => [thumbnail.id, getDataUrlBytes(thumbnail.thumbnailDataUrl)]))
  const orphanIds = new Set([...imageSizes.keys(), ...thumbnailSizes.keys()].filter((id) => !referencedIds.has(id)))
  const orphanBytes = [...orphanIds].reduce((total, id) => total + (imageSizes.get(id) ?? 0) + (thumbnailSizes.get(id) ?? 0), 0)

  return {
    imageCount: images.length,
    imageBytes,
    thumbnailCount: thumbnails.length,
    thumbnailBytes,
    orphanCount: orphanIds.size,
    orphanBytes,
  }
}

export async function inspectAppStorage(state: StorageReferenceState) {
  const [images, thumbnails] = await Promise.all([getAllImages(), getAllImageThumbnails()])
  return calculateAppStorageUsage(images, thumbnails, collectReferencedImageIds(state))
}

export async function removeOrphanedImages(state: StorageReferenceState) {
  const [images, thumbnails] = await Promise.all([getAllImages(), getAllImageThumbnails()])
  const referencedIds = collectReferencedImageIds(state)
  const orphanIds = [...new Set([...images.map((image) => image.id), ...thumbnails.map((thumbnail) => thumbnail.id)])]
    .filter((id) => !referencedIds.has(id))

  await Promise.all(orphanIds.map((id) => deleteImage(id)))
  clearImageCaches()
  return orphanIds.length
}
