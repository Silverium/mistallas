import { and, eq } from 'drizzle-orm'
import { useValidatedParams, zh } from 'h3-zod'

export default eventHandler(async (event) => {
  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  const { user } = await requireUserSession(event)

  const deleted = await useDB().delete(tables.userMeasurements).where(and(
    eq(tables.userMeasurements.id, id),
    eq(tables.userMeasurements.userId, user.id)
  )).returning().get()

  if (!deleted) {
    throw createError({
      statusCode: 404,
      message: 'Measurement not found'
    })
  }

  return deleted
})
