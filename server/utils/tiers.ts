import { eq } from 'drizzle-orm'
import { tables, useDB, sql } from './db'

export type Tier = 'free' | 'premium' | 'enterprise'

export function getPurchaseLimit(tier: Tier): number {
  const limits: Record<Tier, number> = {
    free: 200,
    premium: 5000,
    enterprise: Infinity
  }
  return limits[tier]
}

export async function getUserPurchaseCount(userId: string): Promise<number> {
  const db = useDB()
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.userId, userId))
    .get()

  return result?.count || 0
}

export function getRemainingPurchases(tier: Tier, currentCount: number): number {
  const limit = getPurchaseLimit(tier)
  return Math.max(0, limit - currentCount)
}

export function isAtLimit(tier: Tier, currentCount: number): boolean {
  return currentCount >= getPurchaseLimit(tier)
}

export function getPercentageUsed(tier: Tier, currentCount: number): number {
  const limit = getPurchaseLimit(tier)
  if (limit === Infinity) return 0
  return Math.round((currentCount / limit) * 100)
}
