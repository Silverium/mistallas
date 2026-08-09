import { eq } from 'drizzle-orm'
import { decodeMeasurement } from '@root/server/utils/measurements'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const rows = await useDB().select().from(tables.userMeasurements).where(eq(tables.userMeasurements.userId, user.id)).all()

  return rows
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .map(row => ({ ...row, ...decodeMeasurement(row) }))
})
