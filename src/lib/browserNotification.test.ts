import { describe, expect, it } from 'vitest'
import { hasNotificationDestination } from './browserNotification'

describe('notification destinations', () => {
  it('accepts task and Agent conversation targets', () => {
    expect(hasNotificationDestination({ taskId: 'task-1' })).toBe(true)
    expect(hasNotificationDestination({ conversationId: 'conversation-1' })).toBe(true)
  })

  it('ignores empty native actions', () => {
    expect(hasNotificationDestination({})).toBe(false)
    expect(hasNotificationDestination({ actionId: 'action-1', taskId: '', conversationId: '' })).toBe(false)
  })
})
