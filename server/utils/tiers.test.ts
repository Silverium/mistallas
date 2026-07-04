import { describe, expect, it, vi } from 'vitest'

import { getPercentageUsed, getPurchaseLimit, getRemainingPurchases, isAtLimit } from './tiers'

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    tierLimits: {
      free: 200,
      premium: 5000,
      enterprise: Infinity
    }
  })
}))

vi.mock('./db', () => ({
  tables: {
    purchaseEvents: {
      userId: 'user_id'
    }
  },
  useDB: vi.fn(),
  sql: (strings: TemplateStringsArray) => strings.join('')
}))

const defaultLimits = {
  free: 200,
  premium: 5000,
  enterprise: Infinity
}

describe('tier limits', () => {
  it('defines expected purchase limits for each tier', () => {
    expect(getPurchaseLimit('free', defaultLimits)).toBe(200)
    expect(getPurchaseLimit('premium', defaultLimits)).toBe(5000)
    expect(getPurchaseLimit('enterprise', defaultLimits)).toBe(Infinity)
  })

  it('enforces free and premium limits at boundary', () => {
    expect(isAtLimit('free', 199, defaultLimits)).toBe(false)
    expect(isAtLimit('free', 200, defaultLimits)).toBe(true)

    expect(isAtLimit('premium', 4999, defaultLimits)).toBe(false)
    expect(isAtLimit('premium', 5000, defaultLimits)).toBe(true)
  })

  it('never limits enterprise tier', () => {
    expect(isAtLimit('enterprise', 1, defaultLimits)).toBe(false)
    expect(isAtLimit('enterprise', 100_000_000, defaultLimits)).toBe(false)
  })

  it('calculates remaining and used percentage safely', () => {
    expect(getRemainingPurchases('free', 150, defaultLimits)).toBe(50)
    expect(getRemainingPurchases('free', 999, defaultLimits)).toBe(0)

    expect(getPercentageUsed('free', 100, defaultLimits)).toBe(50)
    expect(getPercentageUsed('enterprise', 9999, defaultLimits)).toBe(0)
  })

  it('respects custom limits from config', () => {
    const customLimits = { free: 100, premium: 1000, enterprise: Infinity }
    expect(getPurchaseLimit('free', customLimits)).toBe(100)
    expect(isAtLimit('free', 100, customLimits)).toBe(true)
    expect(getRemainingPurchases('free', 50, customLimits)).toBe(50)
    expect(getPercentageUsed('free', 50, customLimits)).toBe(50)
  })
})
