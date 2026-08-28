export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024
export const MAX_UPLOAD_DIMENSION = 12000

export function validateDecodedImageSize(width: number, height: number) {
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')
  if (Math.max(width, height) > MAX_UPLOAD_DIMENSION) {
    throw new Error(`图片分辨率过高，最长边不能超过 ${MAX_UPLOAD_DIMENSION} 像素`)
  }
}

export async function validateImageFile(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`图片过大，单张图片不能超过 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`)
  }

  const url = URL.createObjectURL(file)
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new Error('图片无法读取，请选择有效的图片文件'))
      image.src = url
    })
    validateDecodedImageSize(size.width, size.height)
  } finally {
    URL.revokeObjectURL(url)
  }
}
