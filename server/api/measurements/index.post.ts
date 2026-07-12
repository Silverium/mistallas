import { useValidatedBody } from 'h3-zod'
import { encodeMeasurementInsert, measurementCreateSchema } from '../../utils/measurements'

export default eventHandler(async (event) => {
  const input = await useValidatedBody(event, measurementCreateSchema)
  const { user } = await requireUserSession(event)

  const measurement = await useDB().insert(tables.userMeasurements).values({
    userId: user.id,
    recordedAt: input.recordedAt ?? new Date(),
    ...encodeMeasurementInsert(input),
    source: input.source ?? 'manual',
    notes: input.notes ?? null
  }).returning().get()

  return measurement
})
