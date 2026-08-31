import { and, eq, sql } from 'drizzle-orm'
import { categoryMatchKey, MAX_UNVERIFIED_CATEGORIES_PER_USER, toCanonicalCategoryLabel } from '@root/shared/utils/categories'
import { tables, useDB } from './db'

// Resolves raw user-typed category text to its canonical, normalized name,
// registering it in the shared `categories` registry the first time it's seen.
//
// Abuse protection: once a user has MAX_UNVERIFIED_CATEGORIES_PER_USER
// pending review, new categories they type still normalize for their own
// purchase, but stop being registered in the shared registry until an
// existing one of theirs is verified (freeing up a slot).
export async function resolveCategoryName(rawCategory: string, userId: number | string): Promise<string> {
  const db = useDB()
  const matchKey = categoryMatchKey(rawCategory)

  const existing = await db.select().from(tables.categories)
    .where(eq(tables.categories.normalizedName, matchKey)).get()
  if (existing) {
    return existing.name
  }

  const canonicalName = toCanonicalCategoryLabel(rawCategory)

  const unverifiedCount = await db.select({ count: sql<number>`count(*)` }).from(tables.categories)
    .where(and(eq(tables.categories.createdByUserId, userId), eq(tables.categories.verified, 0)))
    .get()

  if ((unverifiedCount?.count ?? 0) >= MAX_UNVERIFIED_CATEGORIES_PER_USER) {
    return canonicalName
  }

  await db.insert(tables.categories).values({
    name: canonicalName,
    normalizedName: matchKey,
    verified: 0,
    createdByUserId: userId,
    createdAt: new Date()
  }).onConflictDoNothing()

  const row = await db.select().from(tables.categories)
    .where(eq(tables.categories.normalizedName, matchKey)).get()

  return row?.name ?? canonicalName
}
