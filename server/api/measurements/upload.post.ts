import { useValidatedBody, z } from 'h3-zod'

const toX100 = (value: number) => Math.round(value * 100)
const toX10 = (value: number) => Math.round(value * 10)

const measurementSchema = z.object({
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
  source: z.string().min(1).max(30).optional(),
  notes: z.string().max(500).optional()
})

export default eventHandler(async (event) => {
  const { measurements } = await useValidatedBody(event, {
    measurements: z.array(measurementSchema).min(1).max(500)
  })
  const { user } = await requireUserSession(event)

  const inserted = await Promise.all(measurements.map(input =>
    useDB().insert(tables.userMeasurements).values({
      userId: user.id,
      recordedAt: input.recordedAt ?? new Date(),
      weightKg: toX100(input.weightKg),
      heightCm: input.heightCm !== undefined ? toX10(input.heightCm) : null,
      chestCm: input.chestCm !== undefined ? toX10(input.chestCm) : null,
      waistCm: input.waistCm !== undefined ? toX10(input.waistCm) : null,
      hipsCm: input.hipsCm !== undefined ? toX10(input.hipsCm) : null,
      shoulderWidthCm: input.shoulderWidthCm !== undefined ? toX10(input.shoulderWidthCm) : null,
      sleeveLengthCm: input.sleeveLengthCm !== undefined ? toX10(input.sleeveLengthCm) : null,
      neckCm: input.neckCm !== undefined ? toX10(input.neckCm) : null,
      inseamCm: input.inseamCm !== undefined ? toX10(input.inseamCm) : null,
      thighCm: input.thighCm !== undefined ? toX10(input.thighCm) : null,
      source: input.source ?? 'upload',
      notes: input.notes ?? null
    }).returning().get()
  ))

  return {
    uploaded: inserted.length,
    measurements: inserted
  }
})
