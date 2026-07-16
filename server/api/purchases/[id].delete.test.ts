import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useValidatedParams = vi.fn()
  const requireUserSession = vi.fn()
  const useDB = vi.fn()
  const bucketDelete = vi.fn()

  const state = {
    purchasePhotos: [] as Array<{ id: number, storageKey: string }>,
    measurementSnapshotsDeleted: false,
    deletedPurchase: { id: 42, userId: 'user-1' }
  }

  const tables = {
    purchaseMeasurementSnapshots: { __table: 'purchaseMeasurementSnapshots' },
    purchasePhotos: {
      __table: 'purchasePhotos',
      id: { __column: 'purchasePhotos.id' },
      storageKey: { __column: 'purchasePhotos.storageKey' },
      purchaseEventId: { __column: 'purchasePhotos.purchaseEventId' },
      userId: { __column: 'purchasePhotos.userId' }
    },
    purchaseEvents: {
      __table: 'purchaseEvents',
      id: { __column: 'purchaseEvents.id' },
      userId: { __column: 'purchaseEvents.userId' }
    }
  }

  const dbClient = {
    select: vi.fn(() => ({
      from: (table: { __table: string }) => ({
        where: () => ({
          all: async () => {
            if (table === tables.purchasePhotos)
              return [...state.purchasePhotos]
            return []
          }
        })
      })
    })),
    delete: vi.fn((table: { __table: string }) => ({
      where: () => {
        if (table === tables.purchaseMeasurementSnapshots) {
          state.measurementSnapshotsDeleted = true
          return undefined
        }

        if (table === tables.purchasePhotos) {
          state.purchasePhotos = []
          return undefined
        }

        if (table === tables.purchaseEvents) {
          return {
            returning: () => ({
              get: async () => state.deletedPurchase
            })
          }
        }

        return undefined
      }
    }))
  }

  return {
    useValidatedParams,
    requireUserSession,
    useDB,
    bucketDelete,
    state,
    tables,
    dbClient,
    zh: {
      intAsString: 'intAsString'
    }
  }
})

vi.mock('h3-zod', () => ({
  useValidatedParams: mocks.useValidatedParams,
  zh: mocks.zh
}))

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value }))
}))

describe('DELETE /api/purchases/:id', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    mocks.state.purchasePhotos = []
    mocks.state.measurementSnapshotsDeleted = false
    mocks.state.deletedPurchase = { id: 42, userId: 'user-1' }

    mocks.useValidatedParams.mockResolvedValue({ id: 42 })
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1' } })
    mocks.useDB.mockImplementation(() => mocks.dbClient)

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { requireUserSession?: unknown }).requireUserSession = mocks.requireUserSession
    ;(globalThis as { useDB?: unknown }).useDB = mocks.useDB
    ;(globalThis as { tables?: unknown }).tables = mocks.tables
    ;(globalThis as { createError?: unknown }).createError = (input: { message: string }) => Object.assign(new Error(input.message), input)
  })

  it('deletes all uploaded photo records from the database when deleting a purchase', async () => {
    mocks.state.purchasePhotos = [
      { id: 1, storageKey: 'purchase-42/front.webp' },
      { id: 2, storageKey: 'purchase-42/side.webp' },
      { id: 3, storageKey: 'purchase-42/detail.webp' }
    ]

    const event = {
      context: {
        cloudflare: {
          env: {
            PURCHASE_PHOTOS: {
              delete: mocks.bucketDelete
            }
          }
        }
      }
    }

    const { default: handler } = await import('./[id].delete')
    const result = await handler(event as never)

    expect(result).toEqual({ id: 42, userId: 'user-1' })
    expect(mocks.state.measurementSnapshotsDeleted).toBe(true)
    expect(mocks.state.purchasePhotos).toEqual([])
    expect(mocks.bucketDelete).toHaveBeenCalledTimes(3)
    expect(mocks.bucketDelete).toHaveBeenNthCalledWith(1, 'purchase-42/front.webp')
    expect(mocks.bucketDelete).toHaveBeenNthCalledWith(2, 'purchase-42/side.webp')
    expect(mocks.bucketDelete).toHaveBeenNthCalledWith(3, 'purchase-42/detail.webp')
  })
})
