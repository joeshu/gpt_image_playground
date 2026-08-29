import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createCreationProject } from './creationWorkspace'
import {
  createCreationReplaySnapshot,
  createCreationReplayState,
  exportCreationReplaySnapshot,
  getCreationReplayMissingImageIds,
  loadCreationReplayState,
  normalizeCreationReplayState,
  parseCreationReplaySnapshot,
  removeCreationReplaySnapshot,
  saveCreationReplayState,
} from './creationReplay'

function createMemoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('creation replay snapshots', () => {
  it('captures the project, prompt, parameters and non-secret API metadata', () => {
    const project = createCreationProject('国企汇报项目', 100)
    project.style.visualDirection = '正式克制'
    const snapshot = createCreationReplaySnapshot({
      project,
      prompt: '保留数字 100%',
      inputImageIds: ['image-a', 'image-a', 'image-b'],
      maskTargetImageId: 'image-a',
      maskImageId: 'mask-a',
      params: { ...DEFAULT_PARAMS, size: '1536x1024', n: 2 },
      sourceMode: 'gallery',
      apiProfileId: 'profile-a',
      apiProfileName: '主配置',
      apiProvider: 'openai',
      apiMode: 'images',
      apiModel: 'gpt-image-2',
    }, 200)

    expect(snapshot.label).toBe('国企汇报项目')
    expect(snapshot.projectSnapshot.style.visualDirection).toBe('正式克制')
    expect(snapshot.inputImageIds).toEqual(['image-a', 'image-b'])
    expect(snapshot.params).toMatchObject({ size: '1536x1024', n: 2 })
    expect(snapshot.apiModel).toBe('gpt-image-2')
    expect(JSON.stringify(snapshot)).not.toContain('apiKey')
  })

  it('normalizes invalid state and keeps the active snapshot valid', () => {
    const state = normalizeCreationReplayState({
      activeSnapshotId: 'missing',
      snapshots: [{
        id: 'snapshot-a',
        label: '  快照  ',
        projectId: 'p1',
        projectSnapshot: { name: '项目' },
        prompt: '提示词',
        inputImageIds: ['a', 1],
        params: { n: 99, quality: 'unknown' },
        sourceMode: 'unknown',
        apiMode: 'unknown',
      }],
    }, 300)

    expect(state.activeSnapshotId).toBe('snapshot-a')
    expect(state.snapshots[0].label).toBe('快照')
    expect(state.snapshots[0].inputImageIds).toEqual(['a'])
    expect(state.snapshots[0].params.n).toBe(10)
    expect(state.snapshots[0].sourceMode).toBe('gallery')
    expect(state.snapshots[0].apiMode).toBeNull()
  })

  it('round-trips state through local storage and removes snapshots safely', () => {
    const storage = createMemoryStorage()
    const project = createCreationProject('本机复现', 100)
    const snapshot = createCreationReplaySnapshot({
      project,
      prompt: '提示词',
      inputImageIds: [],
      params: DEFAULT_PARAMS,
      sourceMode: 'agent',
    }, 200)
    const state = { snapshots: [snapshot], activeSnapshotId: snapshot.id }

    expect(saveCreationReplayState(state, storage)).toBe(true)
    expect(loadCreationReplayState(storage, 300)).toEqual(state)
    expect(removeCreationReplaySnapshot(state, snapshot.id)).toEqual(createCreationReplayState())
  })

  it('exports and restores a portable manifest without image data', () => {
    const project = createCreationProject('导出复现', 100)
    const snapshot = createCreationReplaySnapshot({
      project,
      prompt: '原始提示词',
      inputImageIds: ['image-a'],
      params: DEFAULT_PARAMS,
      sourceMode: 'gallery',
    }, 200)

    const restored = parseCreationReplaySnapshot(exportCreationReplaySnapshot(snapshot, 300), 400)

    expect(restored?.label).toBe('导出复现')
    expect(restored?.inputImageIds).toEqual(['image-a'])
    expect(JSON.stringify(restored)).not.toContain('dataUrl')
  })

  it('reports missing local assets before replay', () => {
    const project = createCreationProject('资产检查', 100)
    const snapshot = createCreationReplaySnapshot({
      project,
      prompt: '提示词',
      inputImageIds: ['image-a', 'image-b'],
      maskImageId: 'mask-a',
      params: DEFAULT_PARAMS,
      sourceMode: 'gallery',
    }, 200)

    expect(getCreationReplayMissingImageIds(snapshot, ['image-a'])).toEqual(['image-b', 'mask-a'])
  })
})
