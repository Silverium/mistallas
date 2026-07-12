import { useValidatedBody, z } from 'h3-zod'

const toX100 = (value: number) => Math.round(value * 100)
const toX10 = (value: number) => Math.round(value * 10)

export default eventHandler(async (event) => {
  const input = await useValidatedBody(event, {
    recordedAt: z.coerce.date().optional(),
    weightKg: z.coerce.number().positive(),
    heightCm: z.coerce.number().positive().optional(),
    chestCm: z.coerce.number().positive().optional(),
    waistCm: z.coerce.number().positive().optional(),
    hipsCm: z.coerce.number().positive().optional(),
    shoulderWidthCm: z.coerce.number().positive().optional(),
    sleeveLengthCm: z.coerce.number().positive().optional(),
    neckCm: z.coerce.number().positive().optional(),
    inseamCm: z.coerce.number().positive().optional(),
    thighCm: z.coerce.number().positive().optional(),
    footCm: z.coerce.number().positive().optional(),
    source: z.string().min(1).max(30).optional(),
    notes: z.string().max(500).optional()
  })
  const { user } = await requireUserSession(event)

  const measurement = await useDB().insert(tables.userMeasurements).values({
    userId: user.id,
    recordedAt: input.recordedAt ?? new Date(),
    weightKg: toX100(input.weightKg),
    heightCm: input.heightCm ? toX10(input.heightCm) : null,
    chestCm: input.chestCm ? toX10(input.chestCm) : null,
    waistCm: input.waistCm ? toX10(input.waistCm) : null,
    hipsCm: input.hipsCm ? toX10(input.hipsCm) : null,
    shoulderWidthCm: input.shoulderWidthCm ? toX10(input.shoulderWidthCm) : null,
    sleeveLengthCm: input.sleeveLengthCm ? toX10(input.sleeveLengthCm) : null,
    neckCm: input.neckCm ? toX10(input.neckCm) : null,
    inseamCm: input.inseamCm ? toX10(input.inseamCm) : null,
    thighCm: input.thighCm ? toX10(input.thighCm) : null,
    footCm: input.footCm ? toX10(input.footCm) : null,
    source: input.source ?? 'manual',
    notes: input.notes ?? null
  }).returning().get()

  return measurement
})
