export function getAdjacentImageIds(imageIds: string[], currentId: string) {
  if (imageIds.length <= 1) return []
  const index = imageIds.indexOf(currentId)
  if (index < 0) return []
  const previous = imageIds[(index - 1 + imageIds.length) % imageIds.length]
  const next = imageIds[(index + 1) % imageIds.length]
  return previous === next ? [previous] : [previous, next]
}
