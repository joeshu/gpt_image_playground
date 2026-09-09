import type { InputAttachment, InputAttachmentKind } from '../types'
import { INPUT_ATTACHMENT_FILE_MAX_BYTES, INPUT_ATTACHMENT_TEXT_MAX_BYTES } from '../types'
import { putAgentAttachment, deleteAgentAttachment, type StoredAgentAttachment } from './db'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'])
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'json', 'csv', 'xml', 'html', 'htm'])
const OFFICE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const OFFICE_EXTENSIONS = new Set(['pdf', 'docx', 'xlsx', 'pptx'])

export function extensionOf(name: string) { return name.toLowerCase().split('.').pop() ?? '' }
export function attachmentKind(file: Pick<File, 'name' | 'type'>): InputAttachmentKind | null {
  if (IMAGE_TYPES.has(file.type) || file.type.startsWith('image/')) return 'image'
  if (TEXT_EXTENSIONS.has(extensionOf(file.name)) || file.type.startsWith('text/')) return 'text'
  if (OFFICE_TYPES.has(file.type) || OFFICE_EXTENSIONS.has(extensionOf(file.name))) return 'file'
  return null
}

export function validateAgentAttachment(file: File): { kind: InputAttachmentKind; mimeType: string } {
  const kind = attachmentKind(file)
  if (!kind) throw new Error(`不支持的附件类型：${file.name}`)
  const limit = kind === 'text' ? INPUT_ATTACHMENT_TEXT_MAX_BYTES : INPUT_ATTACHMENT_FILE_MAX_BYTES
  if (file.size > limit) throw new Error(`${file.name} 超过大小限制（${kind === 'text' ? '512KB' : '20MB'}）`)
  return { kind, mimeType: file.type || (kind === 'text' ? 'text/plain' : 'application/octet-stream') }
}

async function digestId(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  if (globalThis.crypto?.subtle) {
    const hash = await crypto.subtle.digest('SHA-256', bytes)
    return `att_${Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')}`
  }
  let h = 2166136261
  for (const b of new Uint8Array(bytes)) h = Math.imul(h ^ b, 16777619)
  return `att_${(h >>> 0).toString(16)}`
}

export async function createAgentAttachment(file: File): Promise<InputAttachment> {
  const { kind, mimeType } = validateAgentAttachment(file)
  if (kind === 'image') throw new Error('图片请作为参考图添加')
  const id = await digestId(file)
  const record: StoredAgentAttachment = { id, name: file.name, mimeType, size: file.size, kind, createdAt: Date.now(), blob: new Blob([await file.arrayBuffer()], { type: mimeType }) }
  await putAgentAttachment(record)
  return { id, name: record.name, mimeType, size: record.size, kind, createdAt: record.createdAt }
}

export async function removeAgentAttachment(id: string) { await deleteAgentAttachment(id) }
