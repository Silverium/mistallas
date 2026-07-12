import { and, eq } from 'drizzle-orm'
import { useValidatedBody, useValidatedParams, zh } from 'h3-zod'
import { encodeMeasurementPatch, measurementPatchSchema } from '../../utils/measurements'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const input = await useValidatedBody(event, measurementPatchSchema)
  const { user } = await requireUserSession(event)

  const updatePayload = encodeMeasurementPatch(input)

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
