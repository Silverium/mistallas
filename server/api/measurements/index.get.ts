import { eq } from 'drizzle-orm'

const fromX100 = (value: number) => value / 100
const fromX10 = (value: number | null) => value === null ? null : value / 10

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)

  const rows = await useDB().select().from(tables.userMeasurements).where(eq(tables.userMeasurements.userId, user.id)).all()

  return rows
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
    .map(row => ({
      ...row,
      weightKg: fromX100(row.weightKg),
      heightCm: fromX10(row.heightCm),
      chestCm: fromX10(row.chestCm),
      waistCm: fromX10(row.waistCm),
      hipsCm: fromX10(row.hipsCm),
      shoulderWidthCm: fromX10(row.shoulderWidthCm),
      sleeveLengthCm: fromX10(row.sleeveLengthCm),
      neckCm: fromX10(row.neckCm),
      inseamCm: fromX10(row.inseamCm),
      thighCm: fromX10(row.thighCm),
      footCm: fromX10(row.footCm)
    }))
})
