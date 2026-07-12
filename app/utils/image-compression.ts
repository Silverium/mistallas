/**
 * Resizes and compresses an image file for efficient storage.
 * Targets a max dimension (e.g., 1600px) and converts to WebP if possible,
 * or falls back to JPEG/PNG.

 @param file The original File object from a user selection
 * @param maxDimension Maximum width or height in pixels (e.g., 1600)
 * @param quality Compression quality from 0 to 1 (e.g., 0.8)
 * @returns A promise that resolves to a Blob containing the compressed image
 */
export async function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.8
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)

    reader.onload = (event: ProgressEvent<FileReader>) => {
      const img = new Image()
      img.src = event.target!.result as string

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height)
          width *= ratio
          height *= ratio
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        // Convert to WebP for better compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'))
              return
            }
            resolve(blob)
          },
          'image/webp',
          quality
        )
      }

      img.onerror = () => reject(new Error('Image load error'))
    }

    reader.onerror = () => reject(new Error('FileReader error'))
  })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to convert blob to base64'))
        return
      }

      resolve(result)
    }

    reader.onerror = () => reject(new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}
