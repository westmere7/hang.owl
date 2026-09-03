/**
 * Compresses an image File or Blob to WebP format using HTML Canvas.
 * Keeps receipt text sharp while dramatically reducing file size.
 */
export async function compressImageToWebP(
  file: File | Blob,
  filename = 'receipt.jpg',
  options?: {
    maxDimension?: number
    quality?: number
  },
): Promise<{ blob: Blob; filename: string }> {
  const maxDim = options?.maxDimension ?? 2560
  const quality = options?.quality ?? 0.85

  // If already a small webp, return directly
  if (file.type === 'image/webp' && file.size < 500 * 1024) {
    const name = 'name' in file ? (file as File).name : filename
    return { blob: file, filename: name }
  }

  const img = new Image()
  const objectUrl = URL.createObjectURL(file)

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image for compression'))
      img.src = objectUrl
    })

    let { width, height } = img

    // Downscale if exceeds max dimension
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable')
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    })

    if (!blob) {
      throw new Error('WebP conversion failed')
    }

    const originalName = 'name' in file ? (file as File).name : filename
    const baseName = originalName.replace(/\.[^/.]+$/, '')
    return {
      blob,
      filename: `${baseName}.webp`,
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
