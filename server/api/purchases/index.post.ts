import { eq } from 'drizzle-orm'
import { useValidatedBody, z } from 'h3-zod'
import { getUserPurchaseCount, isAtLimit } from '@root/server/utils/tiers'
import { resolveCategoryName } from '@root/server/utils/categories'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  const input = await useValidatedBody(event, {
    brand: z.string().min(1).max(120),
    category: z.string().min(1).max(60),
    productType: z.string().min(1).max(120),
    sizeLabel: z.string().min(1).max(30),
    purchasedAt: z.coerce.date().optional(),
    fitFeedback: z.string().min(1).max(120).optional(),
    notes: z.string().max(500).optional(),
    measurementId: z.coerce.number().int().positive().optional(),
    price: z.coerce.number().min(0).optional()
  })
  const { user } = await requireUserSession(event)

  // Fetch current user tier from database (not from session which may be stale after upgrade)
  const currentUser = await useDB().select().from(tables.users).where(eq(tables.users.id, user.id)).get()
  const currentTier = currentUser?.tier || 'free'

  // Check purchase limit based on current user tier
  const purchaseCount = await getUserPurchaseCount(user.id)
  if (isAtLimit(currentTier, purchaseCount)) {
    throw createError({
      statusCode: 403,
      message: 'Purchase limit reached for your tier. Please upgrade to continue.',
      data: { upgradeUrl: '/account' }
    })
  }

  let measurement = null
  if (input.measurementId) {
    const userMeasurements = await useDB().select().from(tables.userMeasurements).where(eq(tables.userMeasurements.userId, user.id)).all()
    measurement = userMeasurements.find(item => item.id === input.measurementId) ?? null
  }

  if (!measurement || measurement.userId !== user.id) {
    const allMeasurements = await useDB().select().from(tables.userMeasurements).where(eq(tables.userMeasurements.userId, user.id)).all()
    measurement = allMeasurements.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null
  }

  const category = await resolveCategoryName(input.category, user.id)

  const purchase = await useDB().insert(tables.purchaseEvents).values({
    userId: user.id,
    brand: input.brand,
    category,
    productType: input.productType,
    sizeLabel: input.sizeLabel,
    purchasedAt: input.purchasedAt ?? new Date(),
    fitFeedback: input.fitFeedback ?? null,
    notes: input.notes ?? null,
    price: input.price ?? null
  }).returning().get()

  let snapshot = null
  if (measurement) {
    snapshot = await useDB().insert(tables.purchaseMeasurementSnapshots).values({
      purchaseEventId: purchase.id,
      userId: user.id,
      measuredAt: measurement.recordedAt,
      weightKg: measurement.weightKg,
      heightCm: measurement.heightCm,
      chestCm: measurement.chestCm,
      waistCm: measurement.waistCm,
      hipsCm: measurement.hipsCm,
      shoulderWidthCm: measurement.shoulderWidthCm,
      sleeveLengthCm: measurement.sleeveLengthCm,
      neckCm: measurement.neckCm,
      inseamCm: measurement.inseamCm,
      thighCm: measurement.thighCm,
      footCm: measurement.footCm
    }).returning().get()
  }

  return {
    purchase,
    snapshot
  }
})
