import { and, eq } from 'drizzle-orm'
import { useValidatedBody, useValidatedParams, z } from 'h3-zod'
import { decodeMeasurement } from '../../../utils/measurements'
import { tables, useDB } from '../../../utils/db'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: z.coerce.number().int()
  })

  const { measurementId } = await useValidatedBody(event, {
    measurementId: z.coerce.number().int()
  })

  const { user } = await requireUserSession(event)

  // Verify purchase ownership
  const purchase = await useDB().select().from(tables.purchaseEvents).where(and(
    eq(tables.purchaseEvents.id, id),
    eq(tables.purchaseEvents.userId, user.id)
  )).get()

  if (!purchase) {
    throw createError({
      statusCode: 404,
      message: 'Purchase not found'
    })
  }

  // Verify measurement ownership
  const measurement = await useDB().select().from(tables.userMeasurements).where(and(
    eq(tables.userMeasurements.id, measurementId),
    eq(tables.userMeasurements.userId, user.id)
  )).get()

  if (!measurement) {
    throw createError({
      statusCode: 404,
      message: 'Measurement not found'
    })
  }

  // Create or update snapshot
  const existingSnapshot = await useDB().select().from(tables.purchaseMeasurementSnapshots).where(and(
    eq(tables.purchaseMeasurementSnapshots.purchaseEventId, id),
    eq(tables.purchaseMeasurementSnapshots.userId, user.id)
  )).get()

  const now = new Date()
  let snapshot

  if (existingSnapshot) {
    snapshot = await useDB().update(tables.purchaseMeasurementSnapshots).set({
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
    }).where(eq(tables.purchaseMeasurementSnapshots.id, existingSnapshot.id)).returning().get()
  }
  else {
    snapshot = await useDB().insert(tables.purchaseMeasurementSnapshots).values({
      purchaseEventId: id,
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
    success: true,
    snapshot: {
      measuredAt: snapshot.measuredAt,
      ...decodeMeasurement(snapshot)
    }
  }
})
