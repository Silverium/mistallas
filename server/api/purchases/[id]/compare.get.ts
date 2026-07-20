import { and, eq } from 'drizzle-orm'
import { useValidatedParams, zh } from 'h3-zod'
import { decodeMeasurement, fromScaled, measurementFields } from '../../../utils/measurements'
import type { MeasurementKey, MeasurementSource } from '../../../utils/measurements'

type Metric = {
  before: number | null
  now: number | null
  delta: number | null
}

const buildMetric = (thenValue: number | null, nowValue: number | null): Metric => {
  if (thenValue === null || nowValue === null) {
    return { before: thenValue, now: nowValue, delta: null }
  }
  return {
    before: thenValue,
    now: nowValue,
    delta: Number((nowValue - thenValue).toFixed(2))
  }
}

const buildComparison = (snapshotSrc: MeasurementSource, currentSrc: MeasurementSource) =>
  Object.fromEntries(
    measurementFields.map(({ key, scale }) => [
      key,
      buildMetric(fromScaled(snapshotSrc[key], scale), fromScaled(currentSrc[key], scale))
    ])
  ) as Record<MeasurementKey, Metric>

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
      message: 'La compra registrada no tiene unas medidas corporales asociadas. Actualiza tus medidas corporales para que podamos hacer la comparación.'
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

  const comparison = buildComparison(snapshot, current)

  const weightHighlight = comparison.weightKg.before !== null && comparison.weightKg.now !== null
    ? `Tenías ${comparison.weightKg.before}kg la última vez que compraste esto, y ahora tienes ${comparison.weightKg.now}kg (${comparison.weightKg.delta! >= 0 ? '+' : ''}${comparison.weightKg.delta}kg).`
    : null

  return {
    purchase,
    snapshotAtPurchase: {
      measuredAt: snapshot.measuredAt,
      ...decodeMeasurement(snapshot)
    },
    currentMeasurement: {
      recordedAt: current.recordedAt,
      ...decodeMeasurement(current)
    },
    comparison,
    highlights: {
      weight: weightHighlight
    }
  }
})
