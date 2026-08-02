import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useValidatedQuery = vi.fn()
  const useDB = vi.fn()
  const requireUserSession = vi.fn()

  const state = {
    throwFullPurchaseSelect: false,
    throwCorePurchaseSelect: false,
    throwPhotoSelect: false,
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
        where: () => ({
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
              if (state.throwPhotoSelect) {
                throw new Error('no such table: purchase_photos')
              }
              return state.photos
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

vi.mock('../../utils/db', () => ({
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
    mocks.state.fullPurchases = []
    mocks.state.corePurchases = []
    mocks.state.photos = []

    mocks.useValidatedQuery.mockResolvedValue({ page: 1, limit: 100, search: '' })
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.useDB.mockImplementation(() => mocks.dbClient)

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { requireUserSession?: unknown }).requireUserSession = mocks.requireUserSession
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
})
