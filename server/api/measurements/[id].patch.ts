import { and, eq } from 'drizzle-orm'
import { useValidatedBody, useValidatedParams, z, zh } from 'h3-zod'

const toX100 = (value: number) => Math.round(value * 100)
const toX10 = (value: number) => Math.round(value * 10)

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const input = await useValidatedBody(event, {
    recordedAt: z.coerce.date().optional(),
    weightKg: z.number().positive().optional(),
    heightCm: z.number().positive().optional(),
    chestCm: z.number().positive().optional(),
    waistCm: z.number().positive().optional(),
    hipsCm: z.number().positive().optional(),
    shoulderWidthCm: z.number().positive().optional(),
    sleeveLengthCm: z.number().positive().optional(),
    neckCm: z.number().positive().optional(),
    inseamCm: z.number().positive().optional(),
    thighCm: z.number().positive().optional(),
    source: z.string().min(1).max(30).optional(),
    notes: z.string().max(500).optional()
  })
  const { user } = await requireUserSession(event)

  const updatePayload = {
    ...(input.recordedAt !== undefined ? { recordedAt: input.recordedAt } : {}),
    ...(input.weightKg !== undefined ? { weightKg: toX100(input.weightKg) } : {}),
    ...(input.heightCm !== undefined ? { heightCm: toX10(input.heightCm) } : {}),
    ...(input.chestCm !== undefined ? { chestCm: toX10(input.chestCm) } : {}),
    ...(input.waistCm !== undefined ? { waistCm: toX10(input.waistCm) } : {}),
    ...(input.hipsCm !== undefined ? { hipsCm: toX10(input.hipsCm) } : {}),
    ...(input.shoulderWidthCm !== undefined ? { shoulderWidthCm: toX10(input.shoulderWidthCm) } : {}),
    ...(input.sleeveLengthCm !== undefined ? { sleeveLengthCm: toX10(input.sleeveLengthCm) } : {}),
    ...(input.neckCm !== undefined ? { neckCm: toX10(input.neckCm) } : {}),
    ...(input.inseamCm !== undefined ? { inseamCm: toX10(input.inseamCm) } : {}),
    ...(input.thighCm !== undefined ? { thighCm: toX10(input.thighCm) } : {}),
    ...(input.source !== undefined ? { source: input.source } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {})
  }

  const updated = await useDB().update(tables.userMeasurements).set(updatePayload).where(and(
    eq(tables.userMeasurements.id, id),
    eq(tables.userMeasurements.userId, user.id)
  )).returning().get()

  if (!updated) {
    throw createError({
      statusCode: 404,
      message: 'Measurement not found'
    })
  }

  return updated
})
