import { eq } from 'drizzle-orm'
import { useValidatedQuery, z } from 'h3-zod'
import { requireAdminAccess } from '@root/server/utils/admin'
import { getUserPurchaseCount } from '@root/server/utils/tiers'
import { tables, useDB } from '@root/server/utils/db'

export default eventHandler(async (event) => {
  await requireAdminAccess(event)
  const db = useDB()

  const query = await useValidatedQuery(event, {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    tier: z.union([z.enum(['free', 'premium', 'enterprise']), z.literal('all')]).optional(),
    search: z.string().optional()
  })

  const offset = (query.page - 1) * query.limit

  // Build query
  const allUsers = query.tier && query.tier !== 'all'
    ? await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.tier, query.tier as 'free' | 'premium' | 'enterprise'))
        .all()
    : await db
        .select()
        .from(tables.users)
        .all()

  // For now, simple implementation without full text search
  // In production, you might want to add proper search
  const filteredUsers = query.search
    ? allUsers.filter(u => u.id.includes(query.search!))
    : allUsers

  const paginatedUsers = filteredUsers.slice(offset, offset + query.limit)

  // Get purchase counts for each user
  const usersWithCounts = await Promise.all(
    paginatedUsers.map(async (u: typeof allUsers[0]) => ({
      ...u,
      purchaseCount: await getUserPurchaseCount(u.id)
    }))
  )

  return {
    users: usersWithCounts,
    total: filteredUsers.length,
    page: query.page,
    limit: query.limit,
    pages: Math.ceil(filteredUsers.length / query.limit)
  }
})
