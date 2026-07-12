import { and, eq } from 'drizzle-orm'
import { useValidatedParams, zh } from 'h3-zod'

type Metric = {
  then: number | null
  now: number | null
  delta: number | null
}

const fromX100 = (value: number | null) => value === null ? null : value / 100
const fromX10 = (value: number | null) => value === null ? null : value / 10

const metric = (thenValue: number | null, nowValue: number | null): Metric => {
  if (thenValue === null || nowValue === null) {
    return { then: thenValue, now: nowValue, delta: null }
  }

  return {
    then: thenValue,
    now: nowValue,
    delta: Number((nowValue - thenValue).toFixed(2))
  }
}

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const { user } = await requireUserSession(event)

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

  const snapshot = await useDB().select().from(tables.purchaseMeasurementSnapshots).where(and(
    eq(tables.purchaseMeasurementSnapshots.purchaseEventId, purchase.id),
    eq(tables.purchaseMeasurementSnapshots.userId, user.id)
  )).get()

  if (!snapshot) {
    throw createError({
      statusCode: 404,
      message: 'Purchase measurement snapshot not found'
    })
  }

  const currentRows = await useDB().select().from(tables.userMeasurements).where(eq(tables.userMeasurements.userId, user.id)).all()
  const current = currentRows.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0] ?? null

  if (!current) {
    throw createError({
      statusCode: 404,
      message: 'Current measurement not found'
    })
  }

  const weight = metric(fromX100(snapshot.weightKg), fromX100(current.weightKg))
  const height = metric(fromX10(snapshot.heightCm), fromX10(current.heightCm))
  const chest = metric(fromX10(snapshot.chestCm), fromX10(current.chestCm))
  const waist = metric(fromX10(snapshot.waistCm), fromX10(current.waistCm))
  const hips = metric(fromX10(snapshot.hipsCm), fromX10(current.hipsCm))
  const shoulderWidth = metric(fromX10(snapshot.shoulderWidthCm), fromX10(current.shoulderWidthCm))
  const sleeveLength = metric(fromX10(snapshot.sleeveLengthCm), fromX10(current.sleeveLengthCm))
  const neck = metric(fromX10(snapshot.neckCm), fromX10(current.neckCm))
  const inseam = metric(fromX10(snapshot.inseamCm), fromX10(current.inseamCm))
  const thigh = metric(fromX10(snapshot.thighCm), fromX10(current.thighCm))
  const foot = metric(fromX10(snapshot.footCm), fromX10(current.footCm))

  const weightHighlight = weight.then !== null && weight.now !== null
    ? `Tenías ${weight.then}kg la última vez que compraste esto, y ahora tienes ${weight.now}kg (${weight.delta! >= 0 ? '+' : ''}${weight.delta}kg).`
    : null

  return {
    purchase,
    snapshotAtPurchase: {
      measuredAt: snapshot.measuredAt,
      weightKg: fromX100(snapshot.weightKg),
      heightCm: fromX10(snapshot.heightCm),
      chestCm: fromX10(snapshot.chestCm),
      waistCm: fromX10(snapshot.waistCm),
      hipsCm: fromX10(snapshot.hipsCm),
      shoulderWidthCm: fromX10(snapshot.shoulderWidthCm),
      sleeveLengthCm: fromX10(snapshot.sleeveLengthCm),
      neckCm: fromX10(snapshot.neckCm),
      inseamCm: fromX10(snapshot.inseamCm),
      thighCm: fromX10(snapshot.thighCm),
      footCm: fromX10(snapshot.footCm)
    },
    currentMeasurement: {
      recordedAt: current.recordedAt,
      weightKg: fromX100(current.weightKg),
      heightCm: fromX10(current.heightCm),
      chestCm: fromX10(current.chestCm),
      waistCm: fromX10(current.waistCm),
      hipsCm: fromX10(current.hipsCm),
      shoulderWidthCm: fromX10(current.shoulderWidthCm),
      sleeveLengthCm: fromX10(current.sleeveLengthCm),
      neckCm: fromX10(current.neckCm),
      inseamCm: fromX10(current.inseamCm),
      thighCm: fromX10(current.thighCm),
      footCm: fromX10(current.footCm)
    },
    comparison: {
      weightKg: weight,
      heightCm: height,
      chestCm: chest,
      waistCm: waist,
      hipsCm: hips,
      shoulderWidthCm: shoulderWidth,
      sleeveLengthCm: sleeveLength,
      neckCm: neck,
      inseamCm: inseam,
      thighCm: thigh,
      footCm: foot
    },
    highlights: {
      weight: weightHighlight
    }
  }
})
