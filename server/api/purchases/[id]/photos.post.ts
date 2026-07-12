import { eq, and } from 'drizzle-orm'
import { useValidatedParams, z } from 'h3-zod'
import { tables, useDB } from '../../../utils/db'

const photoUploadSchema = z.object({
  fileBase64: z.string().min(1),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  slot: z.coerce.number().int().min(1).max(3).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional()
})

function decodeBase64ToBytes(value: string) {
  const base64 = value.includes(',') ? value.split(',').pop() || '' : value
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

function normalizeMaybeNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (value instanceof Uint8Array) {
    return value.length
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeMaybeDate(value: unknown): string | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value.toISOString()
  }

  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: z.coerce.number().int()
  })
  const { user } = await requireUserSession(event)

  let requestedSlot: number | null = null
  let width: number | null = null
  let height: number | null = null
  let mimeType = ''
  let fileBytes: Uint8Array | null = null

  const contentType = getHeader(event, 'content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await readBody(event)
    const parsedBody = photoUploadSchema.safeParse(body)

    if (!parsedBody.success) {
      throw createError({
        statusCode: 400,
        message: 'Invalid photo upload payload',
        data: parsedBody.error.flatten()
      })
    }

    requestedSlot = parsedBody.data.slot ?? null
    width = parsedBody.data.width ?? null
    height = parsedBody.data.height ?? null
    mimeType = parsedBody.data.mimeType
    fileBytes = decodeBase64ToBytes(parsedBody.data.fileBase64)
  }
  else {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({ statusCode: 400, message: 'No file provided' })
    }

    const file = formData.find(item => item.name === 'file')
    if (!file || !file.type || !file.data) {
      throw createError({ statusCode: 400, message: 'Invalid file' })
    }

    const requestedSlotRaw = formData.find(item => item.name === 'slot')
    if (requestedSlotRaw?.data) {
      const parsedSlot = z.coerce.number().int().min(1).max(3).safeParse(requestedSlotRaw.data.toString('utf-8'))
      if (!parsedSlot.success) {
        throw createError({ statusCode: 400, message: 'Slot must be between 1 and 3' })
      }
      requestedSlot = parsedSlot.data
    }

    const widthRaw = formData.find(item => item.name === 'width')
    if (widthRaw?.data) {
      const parsedWidth = z.coerce.number().int().positive().safeParse(widthRaw.data.toString('utf-8'))
      if (!parsedWidth.success) {
        throw createError({ statusCode: 400, message: 'Invalid width value' })
      }
      width = parsedWidth.data
    }

    const heightRaw = formData.find(item => item.name === 'height')
    if (heightRaw?.data) {
      const parsedHeight = z.coerce.number().int().positive().safeParse(heightRaw.data.toString('utf-8'))
      if (!parsedHeight.success) {
        throw createError({ statusCode: 400, message: 'Invalid height value' })
      }
      height = parsedHeight.data
    }

    mimeType = file.type
    fileBytes = file.data
  }

  if (!fileBytes || !mimeType) {
    throw createError({ statusCode: 400, message: 'Invalid file payload' })
  }

  // Validate mime type and size
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(mimeType)) {
    throw createError({ statusCode: 400, message: 'Invalid file type. Supported types: JPEG, PNG, WebP' })
  }

  const MAX_SIZE = 1 * 1024 * 1024 // 1MB hard limit
  if (fileBytes.length > MAX_SIZE) {
    throw createError({ statusCode: 400, message: 'File size exceeds limit (1MB)' })
  }

  // 2. Verify purchase ownership and slot availability
  const db = useDB()
  const purchase = await db.select().from(tables.purchaseEvents).where(
    and(eq(tables.purchaseEvents.id, id), eq(tables.purchaseEvents.userId, user.id))
  ).get()

  if (!purchase) {
    throw createError({ statusCode: 404, message: 'Purchase not found' })
  }

  // Check existing photos and enforce "up to 3"
  const existingPhotos = await db.select().from(tables.purchasePhotos).where(
    and(
      eq(tables.purchasePhotos.purchaseEventId, id),
      eq(tables.purchasePhotos.userId, user.id)
    )
  ).all()

  const occupiedSlots = new Set(existingPhotos.map(photo => photo.slot))

  if (existingPhotos.length >= 3 && !requestedSlot) {
    throw createError({ statusCode: 400, message: 'Maximum of 3 photos allowed per purchase' })
  }

  // Determine slot: explicit slot or first available slot
  const slot = requestedSlot ?? [1, 2, 3].find(candidate => !occupiedSlots.has(candidate))

  if (!slot) {
    throw createError({ statusCode: 400, message: 'Maximum of 3 photos allowed per purchase' })
  }

  const existingSlotPhoto = existingPhotos.find(photo => photo.slot === slot) ?? null

  // 3. Prepare R2 storage
  const bucket = event.context.cloudflare?.env?.PURCHASE_PHOTOS
    ? event.context.cloudflare.env.PURCHASE_PHOTOS
    : event.context.cloudflare?.env?.PHOTOS
      ? event.context.cloudflare.env.PHOTOS
      : null

  if (!bucket) {
    // Fallback for local dev if using wrangler/nitro without real R2 binding setup yet?
    // In a real app, we'd throw or use a local emulator.
    throw createError({ statusCode: 500, message: 'R2 bucket not configured' })
  }

  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/jpeg'
      ? 'jpg'
      : 'webp'
  const storageKey = `users/${user.id}/purchases/${purchase.id}/${slot}.${extension}`

  // 4. Upload to R2
  await bucket.put(storageKey, fileBytes, {
    httpMetadata: { contentType: mimeType }
  })

  if (existingSlotPhoto?.storageKey && existingSlotPhoto.storageKey !== storageKey) {
    await bucket.delete(existingSlotPhoto.storageKey)
  }

  // 5. Save metadata to D1
  const now = new Date()
  const newPhoto = existingSlotPhoto
    ? await db.update(tables.purchasePhotos).set({
        storageKey,
        mimeType,
        width,
        height,
        bytes: fileBytes.length,
        createdAt: now
      }).where(eq(tables.purchasePhotos.id, existingSlotPhoto.id)).returning().get()
    : await db.insert(tables.purchasePhotos).values({
        purchaseEventId: id,
        userId: user.id,
        storageKey,
        slot,
        mimeType,
        width,
        height,
        bytes: fileBytes.length,
        createdAt: now
      }).returning().get()

  return {
    photo: {
      id: Number(newPhoto.id),
      purchaseEventId: Number(newPhoto.purchaseEventId),
      userId: String(newPhoto.userId),
      storageKey: String(newPhoto.storageKey),
      slot: Number(newPhoto.slot),
      mimeType: String(newPhoto.mimeType),
      width: normalizeMaybeNumber(newPhoto.width),
      height: normalizeMaybeNumber(newPhoto.height),
      bytes: normalizeMaybeNumber(newPhoto.bytes),
      createdAt: normalizeMaybeDate(newPhoto.createdAt)
    },
    slot
  }
})
