import { eq } from 'drizzle-orm'
import { useValidatedBody, useValidatedParams, z, zh } from 'h3-zod'
import { requireAdminAccess } from '@root/server/utils/admin'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const { id } = await useValidatedParams(event, {
    id: zh.intAsString
  })
  await useValidatedBody(event, {
    verified: z.literal(true)
  })

  const updatedCategory = await db.update(tables.categories)
    .set({ verified: 1 })
    .where(eq(tables.categories.id, id))
    .returning()
    .get()

  if (!updatedCategory) {
    throw createError({ statusCode: 404, message: 'Category not found' })
  }

  return {
    id: updatedCategory.id,
    name: updatedCategory.name,
    verified: Boolean(updatedCategory.verified),
    createdByUserId: updatedCategory.createdByUserId
  }
})
