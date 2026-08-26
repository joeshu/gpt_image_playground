export interface ImagePanBounds {
  maxX: number
  maxY: number
}

export function getImagePanBounds(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number, scale: number, margin = 24): ImagePanBounds {
  if (scale <= 1) return { maxX: 0, maxY: 0 }
  return {
    maxX: Math.max(0, (imageWidth * scale - viewportWidth) / 2 + margin),
    maxY: Math.max(0, (imageHeight * scale - viewportHeight) / 2 + margin),
  }
}

export function clampImagePan(value: number, max: number) {
  return Math.max(-max, Math.min(max, value))
}
