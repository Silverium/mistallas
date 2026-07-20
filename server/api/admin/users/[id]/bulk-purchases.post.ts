import { eq } from 'drizzle-orm'
import { useValidatedBody, z } from 'h3-zod'
import { requireAdminAccess } from '../../../../utils/admin'
import { tables, useDB } from '../../../../utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)

  const userId = decodeURIComponent(getRouterParam(event, 'id') || '')
  if (!userId) {
    throw createError({ statusCode: 400, message: 'Missing user ID' })
  }

  const input = await useValidatedBody(event, {
    count: z.number().int().min(1).max(5000),
    startDate: z.string().datetime().optional(),
    brands: z.array(z.string().min(1)).optional()
  })

  const db = useDB()

  // Verify target user exists
  const targetUser = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get()

  if (!targetUser) {
    throw createError({ statusCode: 404, message: 'Target user not found' })
  }

  // Get or create a measurement for this user (required for purchases)
  let measurement = await db
    .select()
    .from(tables.userMeasurements)
    .where(eq(tables.userMeasurements.userId, userId))
    .get()

  if (!measurement) {
    // Create a default measurement if none exists
    measurement = await db
      .insert(tables.userMeasurements)
      .values({
        userId,
        recordedAt: new Date(),
        weightKg: 7000, // 70 kg as stored (x100)
        heightCm: 1800, // 180 cm as stored (x10)
        source: 'admin_bulk_test',
        notes: 'Auto-created for bulk purchase testing'
      })
      .returning()
      .get()
  }

  const brands = input.brands || ['Nike', 'Adidas', 'Puma', 'ASICS', 'New Balance', 'Levi\'s', 'Gap', 'H&M']
  const categories = ['Shoes', 'Apparel', 'Accessories', 'Outerwear', 'Activewear']
  const productTypes = ['Running Shoes', 'T-Shirt', 'Shorts', 'Jeans', 'Socks', 'Cap', 'Jacket', 'Sweater', 'Pants', 'Hoodie']
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '30', '32', '34', '36', '38', '40', '42', '44']
  const fitFeedbacks = ['Perfect', 'Snug', 'Loose', 'Just Right', null, null]

  const purchases = []
  const baseDate = input.startDate ? new Date(input.startDate) : new Date()

  for (let i = 0; i < input.count; i++) {
    const purchase = await db
      .insert(tables.purchaseEvents)
      .values({
        userId,
        brand: brands[i % brands.length],
        category: categories[i % categories.length],
        productType: productTypes[i % productTypes.length],
        sizeLabel: sizes[i % sizes.length],
        purchasedAt: new Date(baseDate.getTime() - i * 86400000), // decrement by 1 day each
        fitFeedback: fitFeedbacks[i % fitFeedbacks.length],
        notes: `Bulk test purchase #${i + 1}`,
        price: Math.random() > 0.3 ? Math.floor(Math.random() * 20000) / 100 : null // random 0-200 or null
      })
      .returning()
      .get()

    // Create measurement snapshot for each purchase
    await db
      .insert(tables.purchaseMeasurementSnapshots)
      .values({
        purchaseEventId: purchase.id,
        userId,
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
      })

    purchases.push(purchase)
  }

  return {
    created: purchases.length,
    userId,
    startDate: purchases[0]?.purchasedAt,
    endDate: purchases[purchases.length - 1]?.purchasedAt,
    message: `Created ${purchases.length} test purchases for user ${userId}`
  }
})
