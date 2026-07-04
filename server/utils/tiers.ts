import { eq } from 'drizzle-orm'
import { tables, useDB, sql } from './db'
import { useRuntimeConfig } from '#imports'

export type Tier = 'free' | 'premium' | 'enterprise'

export type TierLimits = Record<Tier, number>

const DEFAULT_TIER_LIMITS: TierLimits = {
  free: 200,
  premium: 5000,
  enterprise: Infinity
}

function parseLimit(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const raw = String(value).trim().toLowerCase()
  if (raw === 'infinity' || raw === 'inf' || raw === 'unlimited') return Infinity
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveTierLimits(overrides?: Partial<TierLimits>): TierLimits {
  if (overrides) {
    return {
      free: parseLimit(overrides.free, DEFAULT_TIER_LIMITS.free),
      premium: parseLimit(overrides.premium, DEFAULT_TIER_LIMITS.premium),
      enterprise: parseLimit(overrides.enterprise, DEFAULT_TIER_LIMITS.enterprise)
    }
  }
  const config = useRuntimeConfig().tierLimits as Partial<TierLimits> | undefined
  return {
    free: parseLimit(config?.free, DEFAULT_TIER_LIMITS.free),
    premium: parseLimit(config?.premium, DEFAULT_TIER_LIMITS.premium),
    enterprise: parseLimit(config?.enterprise, DEFAULT_TIER_LIMITS.enterprise)
  }
}

export function getPurchaseLimit(tier: Tier, limits?: Partial<TierLimits>): number {
  return resolveTierLimits(limits)[tier]
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

export function getRemainingPurchases(tier: Tier, currentCount: number, limits?: Partial<TierLimits>): number {
  const limit = getPurchaseLimit(tier, limits)
  return Math.max(0, limit - currentCount)
}

export function isAtLimit(tier: Tier, currentCount: number, limits?: Partial<TierLimits>): boolean {
  return currentCount >= getPurchaseLimit(tier, limits)
}

export function getPercentageUsed(tier: Tier, currentCount: number, limits?: Partial<TierLimits>): number {
  const limit = getPurchaseLimit(tier, limits)
  if (limit === Infinity) return 0
  return Math.round((currentCount / limit) * 100)
}
