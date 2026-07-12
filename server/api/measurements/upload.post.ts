import { useValidatedBody, z } from 'h3-zod'
import { encodeMeasurementInsert, measurementCreateSchema } from '../../utils/measurements'

export default eventHandler(async (event) => {
  const { measurements } = await useValidatedBody(event, {
    measurements: z.array(measurementCreateSchema).min(1).max(500)
  })
  const { user } = await requireUserSession(event)

  const inserted = await Promise.all(measurements.map(input =>
    useDB().insert(tables.userMeasurements).values({
      userId: user.id,
      recordedAt: input.recordedAt ?? new Date(),
      ...encodeMeasurementInsert(input),
      source: input.source ?? 'upload',
      notes: input.notes ?? null
    }).returning().get()
  ))

  return {
    uploaded: inserted.length,
    measurements: inserted
  }
})
