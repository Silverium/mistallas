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
  quality = 0.8,
  maxBytes = 950 * 1024
): Promise<Blob> {
  const source = await decodeImage(file)

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('No se pudo preparar el compresor de imágenes.')
    }

    let width = source.width
    let height = source.height

    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height)
      width = Math.max(1, Math.round(width * ratio))
      height = Math.max(1, Math.round(height * ratio))
    }

    let currentQuality = quality
    let bestBlob: Blob | null = null

    for (let attempt = 0; attempt < 8; attempt++) {
      canvas.width = width
      canvas.height = height
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(source.image, 0, 0, width, height)

      const compressed = await canvasToBlob(canvas, 'image/webp', currentQuality)
      bestBlob = compressed

      if (compressed.size <= maxBytes) {
        return compressed
      }

      if (currentQuality > 0.5) {
        currentQuality = Number(Math.max(0.5, currentQuality - 0.1).toFixed(2))
      }
      else {
        width = Math.max(1, Math.round(width * 0.85))
        height = Math.max(1, Math.round(height * 0.85))
      }
    }

    if (!bestBlob) {
      throw new Error('No se pudo comprimir la imagen.')
    }

    return bestBlob
  }
  finally {
    source.cleanup?.()
  }
}

type DecodedImageSource = {
  image: CanvasImageSource
  width: number
  height: number
  cleanup?: () => void
}

function isHeicLike(file: File): boolean {
  const mime = file.type.toLowerCase()
  const filename = file.name.toLowerCase()

  return (
    mime === 'image/heic'
    || mime === 'image/heif'
    || filename.endsWith('.heic')
    || filename.endsWith('.heif')
  )
}

async function normalizeInputImage(file: File): Promise<Blob> {
  if (!isHeicLike(file)) {
    return file
  }

  try {
    const heicToModule = await import('heic-to')
    const heicTo = heicToModule.heicTo as (options: {
      blob: Blob
      type: string
      quality: number
    }) => Promise<Blob>

    const converted = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.9
    })

    if (!(converted instanceof Blob)) {
      throw new Error('HEIC conversion did not return an image blob.')
    }

    return converted
  }
  catch {
    throw new Error('No se pudo convertir la imagen HEIC/HEIF para comprimirla. Prueba con JPG o PNG.')
  }
}

async function decodeImage(file: File): Promise<DecodedImageSource> {
  const nativeDecoded = await tryDecodeBlob(file)
  if (nativeDecoded) {
    return nativeDecoded
  }

  if (isHeicLike(file)) {
    const converted = await normalizeInputImage(file)
    const convertedDecoded = await tryDecodeBlob(converted)

    if (convertedDecoded) {
      return convertedDecoded
    }

    throw new Error('No se pudo convertir la imagen HEIC/HEIF para comprimirla. Prueba con JPG o PNG.')
  }

  throw new Error('No se pudo procesar el formato de imagen. Prueba con JPG, PNG o WebP.')
}

async function tryDecodeBlob(inputImage: Blob): Promise<DecodedImageSource | null> {
  const byBitmap = await tryDecodeWithImageBitmap(inputImage)
  if (byBitmap) {
    return byBitmap
  }

  return await tryDecodeWithImageTag(inputImage)
}

async function tryDecodeWithImageBitmap(inputImage: Blob): Promise<DecodedImageSource | null> {
  if (typeof createImageBitmap !== 'function') {
    return null
  }

  try {
    const bitmap = await createImageBitmap(inputImage)
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close()
    }
  }
  catch {
    return null
  }
}

async function tryDecodeWithImageTag(inputImage: Blob): Promise<DecodedImageSource | null> {
  const dataUrl = await readFileAsDataUrl(inputImage)

  return new Promise((resolve) => {
    const img = new Image()

    img.onload = () => {
      resolve({
        image: img,
        width: img.width,
        height: img.height
      })
    }

    img.onerror = () => {
      resolve(null)
    }

    img.src = dataUrl
  })
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No se pudo leer la imagen seleccionada.'))
        return
      }

      resolve(reader.result)
    }

    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
    reader.readAsDataURL(file)
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('No se pudo generar la imagen comprimida.'))
        return
      }

      resolve(blob)
    }, type, quality)
  })
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo convertir la imagen para subirla.'))
        return
      }

      resolve(result)
    }

    reader.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
    reader.readAsDataURL(blob)
  })
}
