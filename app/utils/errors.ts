import { ZodError } from 'zod'
import type { NuxtError } from '#app'

export function isNuxtZodError(err: unknown): err is NuxtError<{ data: ZodError }> {
  return (
    isNuxtError(err)
    && (err.data as { data?: unknown })?.data instanceof ZodError
  )
}

export function getApiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') {
    return undefined
  }

  if ('data' in err) {
    const message = (err.data as { message?: string } | undefined)?.message
    if (message) {
      return message
    }
  }

  if ('message' in err && typeof err.message === 'string' && err.message.trim()) {
    return err.message
  }

  return undefined
}

const serverErrorSpanishMap: Record<string, string> = {
  'Maximum of 3 photos allowed per purchase': 'Máximo de 3 fotos por compra.',
  'File size exceeds limit (1MB)': 'La imagen supera el límite de 1 MB.',
  'Invalid file type. Supported types: JPEG, PNG, WebP, HEIC, HEIF': 'Formato de imagen no compatible. Usa JPG, PNG, WebP, HEIC o HEIF.',
  'No file provided': 'No se encontró ningún archivo para subir.',
  'Invalid file': 'El archivo seleccionado no es válido.'
}

export function getSpanishApiErrorMessage(err: unknown): string | undefined {
  const message = getApiErrorMessage(err)
  if (!message) {
    return undefined
  }

  return serverErrorSpanishMap[message] ?? message
}
