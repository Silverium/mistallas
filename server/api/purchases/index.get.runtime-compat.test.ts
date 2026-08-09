import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useValidatedQuery = vi.fn()
  const useDB = vi.fn()
  const requireUserSession = vi.fn()

  const state = {
    throwFullPurchaseSelect: false,
    throwCorePurchaseSelect: false,
    throwPhotoSelect: false,
    throwPhotoSelectWhenBatchExceeds: 0,
    throwPhotoSelectOnCalls: [] as number[],
    photoSelectCallCount: 0,
    photoBatchSizes: [] as number[],
    fullPurchases: [] as Array<Record<string, unknown>>,
    corePurchases: [] as Array<Record<string, unknown>>,
    photos: [] as Array<{ purchaseEventId: number, slot: number }>
  }

  const tables = {
    purchaseEvents: {
      __table: 'purchaseEvents',
      id: { __column: 'purchaseEvents.id' },
      userId: { __column: 'purchaseEvents.userId' },
      brand: { __column: 'purchaseEvents.brand' },
      category: { __column: 'purchaseEvents.category' },
      productType: { __column: 'purchaseEvents.productType' },
      sizeLabel: { __column: 'purchaseEvents.sizeLabel' },
      purchasedAt: { __column: 'purchaseEvents.purchasedAt' }
    },
    purchasePhotos: {
      __table: 'purchasePhotos',
      purchaseEventId: { __column: 'purchasePhotos.purchaseEventId' },
      userId: { __column: 'purchasePhotos.userId' },
      slot: { __column: 'purchasePhotos.slot' }
    }
  }

  const dbClient = {
    select: vi.fn((fields?: Record<string, unknown>) => ({
      from: (table: { __table: string }) => ({
        where: (whereCondition?: unknown) => ({
          orderBy: () => ({
            all: async () => {
              if (table === tables.purchaseEvents) {
                if (!fields) {
                  if (state.throwFullPurchaseSelect) {
                    throw new Error('no such column: fit_feedback')
                  }
                  return state.fullPurchases
                }

                if (state.throwCorePurchaseSelect) {
                  throw new Error('no such table: purchase_events')
                }

                return state.corePurchases
              }

              return []
            }
          }),
          all: async () => {
            if (table === tables.purchasePhotos) {
              state.photoSelectCallCount += 1

              const conditions = Array.isArray(whereCondition) ? whereCondition : [whereCondition]
              const inArrayCondition = conditions.find((condition) => {
                if (!condition || typeof condition !== 'object') {
                  return false
                }

                const maybeValues = (condition as { values?: unknown }).values
                return Array.isArray(maybeValues)
              }) as { values?: unknown[] } | undefined

              const batchIds = Array.isArray(inArrayCondition?.values)
                ? inArrayCondition.values.map(value => Number(value)).filter(value => Number.isFinite(value))
                : []

              if (batchIds.length > 0) {
                state.photoBatchSizes.push(batchIds.length)
              }

              if (state.throwPhotoSelectWhenBatchExceeds > 0 && batchIds.length > state.throwPhotoSelectWhenBatchExceeds) {
                throw new Error('D1_ERROR: too many SQL variables at offset 440: SQLITE_ERROR')
              }

              if (state.throwPhotoSelectOnCalls.includes(state.photoSelectCallCount)) {
                throw new Error('simulated intermittent purchase_photos read failure')
              }

              if (state.throwPhotoSelect) {
                throw new Error('no such table: purchase_photos')
              }

              if (!batchIds.length) {
                return state.photos
              }

              return state.photos.filter(photo => batchIds.includes(Number(photo.purchaseEventId)))
            }

            return []
          }
        })
      })
    }))
  }

  const chain = {
    int: () => chain,
    positive: () => chain,
    default: () => chain,
    transform: () => chain,
    optional: () => chain
  }

  return {
    useValidatedQuery,
    useDB,
    requireUserSession,
    state,
    tables,
    dbClient,
    z: {
      coerce: {
        number: () => chain
      },
      string: () => chain
    }
  }
})

vi.mock('h3-zod', () => ({
  useValidatedQuery: mocks.useValidatedQuery,
  z: mocks.z
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({ column, values })),
  desc: vi.fn((column: unknown) => column)
}))

vi.mock('@root/server/utils/db', () => ({
  tables: mocks.tables,
  useDB: mocks.useDB
}))

describe('GET /api/purchases runtime compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.state.throwFullPurchaseSelect = false
    mocks.state.throwCorePurchaseSelect = false
    mocks.state.throwPhotoSelect = false
    mocks.state.throwPhotoSelectWhenBatchExceeds = 0
    mocks.state.throwPhotoSelectOnCalls = []
    mocks.state.photoSelectCallCount = 0
    mocks.state.photoBatchSizes = []
    mocks.state.fullPurchases = []
    mocks.state.corePurchases = []
    mocks.state.photos = []

    mocks.useValidatedQuery.mockResolvedValue({ page: 1, limit: 100, search: '' })
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.useDB.mockImplementation(() => mocks.dbClient)

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { requireUserSession?: unknown }).requireUserSession = mocks.requireUserSession
    ;(globalThis as { setHeader?: unknown }).setHeader = vi.fn()
  })

  it('falls back to core purchase columns when full select fails and still returns purchases', async () => {
    mocks.state.throwFullPurchaseSelect = true
    mocks.state.corePurchases = [{
      id: 11,
      userId: 'user-1',
      brand: 'Adidas',
      category: 'calzado',
      productType: 'Zapatillas',
      sizeLabel: '42',
      purchasedAt: new Date('2026-07-01T00:00:00.000Z')
    }]

    const { default: handler } = await import('./index.get')
    const result = await handler({} as never)

    expect(result.purchases).toHaveLength(1)
    expect(result.purchases[0]).toMatchObject({
      id: 11,
      brand: 'Adidas',
      fitFeedback: null,
      notes: null,
      price: null,
      photoSlots: []
    })
    expect(result.pagination).toMatchObject({ page: 1, limit: 100, total: 1, totalPages: 1 })
  })

  it('returns empty result instead of 500 when both purchase reads fail', async () => {
    mocks.state.throwFullPurchaseSelect = true
    mocks.state.throwCorePurchaseSelect = true

    const { default: handler } = await import('./index.get')
    const result = await handler({} as never)

    expect(result).toEqual({
      purchases: [],
      pagination: {
        page: 1,
        limit: 100,
        total: 0,
        totalPages: 0
      }
    })
  })

  it('returns purchases even when photo enrichment query fails', async () => {
    mocks.state.fullPurchases = [{
      id: 22,
      userId: 'user-1',
      brand: 'Nike',
      category: 'ropa',
      productType: 'Camiseta',
      sizeLabel: 'M',
      purchasedAt: new Date('2026-07-01T00:00:00.000Z')
    }]
    mocks.state.throwPhotoSelect = true

    const { default: handler } = await import('./index.get')
    const result = await handler({} as never)

    expect(result.purchases).toHaveLength(1)
    expect(result.purchases[0]).toMatchObject({ id: 22, brand: 'Nike', photoSlots: [] })
    expect(result.pagination).toMatchObject({ total: 1 })
  })

  it('batches photo enrichment queries to avoid D1 variable limits on large pages', async () => {
    mocks.state.throwPhotoSelectWhenBatchExceeds = 90
    mocks.state.fullPurchases = Array.from({ length: 100 }, (_unused, index) => ({
      id: index + 1,
      userId: 'user-1',
      brand: `Brand-${index + 1}`,
      category: 'ropa',
      productType: 'Camiseta',
      sizeLabel: 'M',
      purchasedAt: new Date('2026-07-01T00:00:00.000Z')
    }))
    mocks.state.photos = [
      { purchaseEventId: 100, slot: 1 },
      { purchaseEventId: 95, slot: 2 },
      { purchaseEventId: 1, slot: 3 }
    ]

    const { default: handler } = await import('./index.get')
    const result = await handler({} as never)

    expect(result.purchases).toHaveLength(100)
    expect(Math.max(...mocks.state.photoBatchSizes)).toBeLessThanOrEqual(90)
    expect(mocks.state.photoBatchSizes.length).toBeGreaterThan(1)

    const purchase100 = result.purchases.find((purchase: { id: number }) => purchase.id === 100)
    const purchase95 = result.purchases.find((purchase: { id: number }) => purchase.id === 95)
    const purchase1 = result.purchases.find((purchase: { id: number }) => purchase.id === 1)

    expect(purchase100).toMatchObject({ id: 100, photoSlots: [1] })
    expect(purchase95).toMatchObject({ id: 95, photoSlots: [2] })
    expect(purchase1).toMatchObject({ id: 1, photoSlots: [3] })
  })

  it('continues photo enrichment after one batch fails and preserves slots from successful batches', async () => {
    mocks.state.throwPhotoSelectOnCalls = [2]
    mocks.useValidatedQuery.mockResolvedValueOnce({ page: 1, limit: 181, search: '' })
    mocks.state.fullPurchases = Array.from({ length: 181 }, (_unused, index) => ({
      id: index + 1,
      userId: 'user-1',
      brand: `Brand-${index + 1}`,
      category: 'ropa',
      productType: 'Camiseta',
      sizeLabel: 'M',
      purchasedAt: new Date('2026-07-01T00:00:00.000Z')
    }))
    mocks.state.photos = [
      { purchaseEventId: 1, slot: 1 },
      { purchaseEventId: 95, slot: 2 },
      { purchaseEventId: 100, slot: 3 },
      { purchaseEventId: 181, slot: 1 }
    ]

    const { default: handler } = await import('./index.get')
    const result = await handler({} as never)

    expect(result.purchases).toHaveLength(181)
    expect(mocks.state.photoSelectCallCount).toBe(3)
    expect(Math.max(...mocks.state.photoBatchSizes)).toBeLessThanOrEqual(90)

    const purchase1 = result.purchases.find((purchase: { id: number }) => purchase.id === 1)
    const purchase95 = result.purchases.find((purchase: { id: number }) => purchase.id === 95)
    const purchase100 = result.purchases.find((purchase: { id: number }) => purchase.id === 100)
    const purchase181 = result.purchases.find((purchase: { id: number }) => purchase.id === 181)

    expect(purchase1).toMatchObject({ id: 1, photoSlots: [1] })
    expect(purchase95).toMatchObject({ id: 95, photoSlots: [] })
    expect(purchase100).toMatchObject({ id: 100, photoSlots: [] })
    expect(purchase181).toMatchObject({ id: 181, photoSlots: [1] })
  })
})
