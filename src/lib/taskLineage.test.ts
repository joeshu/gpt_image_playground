import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '../types'
import { getTaskComparisonImageIds, getTaskLineage } from './taskLineage'

function task(id: string, createdAt: number, inputImageIds: string[], outputImages: string[]) {
  return { id, createdAt, inputImageIds, outputImages } as TaskRecord
}

describe('task image lineage', () => {
  it('selects the latest source task and ordered direct children', () => {
    const sourceA = task('source-a', 1, [], ['image-a'])
    const sourceB = task('source-b', 2, [], ['image-b'])
    const current = task('current', 3, ['image-a', 'image-b'], ['image-current'])
    const childB = task('child-b', 5, ['image-current'], ['image-child-b'])
    const childA = task('child-a', 4, ['image-current'], ['image-child-a'])

    const lineage = getTaskLineage(current, [childB, sourceA, current, childA, sourceB])

    expect(lineage.parent?.id).toBe('source-b')
    expect(lineage.children.map((item) => item.id)).toEqual(['child-a', 'child-b'])
  })

  it('does not treat unrelated or older consumers as children', () => {
    const current = task('current', 3, [], ['image-current'])
    const older = task('older', 2, ['image-current'], [])
    const unrelated = task('unrelated', 4, ['other'], [])

    expect(getTaskLineage(current, [older, unrelated]).children).toEqual([])
  })

  it('selects the exact referenced parent output and active current result', () => {
    const source = task('source', 1, [], ['source-a', 'source-b'])
    const current = task('current', 2, ['source-b'], ['result-a', 'result-b'])

    expect(getTaskComparisonImageIds(current, source, 'result-b')).toEqual({
      beforeImageId: 'source-b',
      afterImageId: 'result-b',
    })
  })

  it('does not offer comparison when either side has no image', () => {
    const source = task('source', 1, [], [])
    const current = task('current', 2, [], ['result'])

    expect(getTaskComparisonImageIds(current, source)).toBeNull()
    expect(getTaskComparisonImageIds(current, null)).toBeNull()
  })
})
