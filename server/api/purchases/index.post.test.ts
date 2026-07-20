import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useValidatedBody = vi.fn()
  const useDB = vi.fn()
  const requireUserSession = vi.fn()

  const state = {
    purchaseCount: 0,
    measurements: [] as Array<{ id: number, userId: string, recordedAt: Date }>,
    createdPurchase: { id: 101, userId: 'user-1' },
    createdSnapshot: { id: 202, purchaseEventId: 101, userId: 'user-1' }
  }

  const tables = {
    userMeasurements: { __table: 'userMeasurements' },
    purchaseEvents: { __table: 'purchaseEvents' },
    purchaseMeasurementSnapshots: { __table: 'purchaseMeasurementSnapshots' }
  }

  const dbClient = {
    select: vi.fn(() => ({
      from: (table: { __table: string }) => ({
        where: () => ({
          get: async () => {
            if (table === tables.purchaseEvents)
              return { count: state.purchaseCount }
            return null
          },
          all: async () => {
            if (table === tables.userMeasurements)
              return state.measurements
            return []
          }
        }),
        all: async () => {
          if (table === tables.userMeasurements)
            return state.measurements
          return []
        }
      })
    })),
    insert: vi.fn((table: { __table: string }) => ({
      values: () => ({
        returning: () => ({
          get: async () => {
            if (table === tables.purchaseEvents)
              return state.createdPurchase
            if (table === tables.purchaseMeasurementSnapshots)
              return state.createdSnapshot
            return null
          }
        })
      })
    }))
  }

  const chain = {
    min: () => chain,
    max: () => chain,
    optional: () => chain,
    int: () => chain,
    positive: () => chain
  }

  return {
    useValidatedBody,
    useDB,
    dbClient,
    tables,
    state,
    requireUserSession,
    z: {
      string: () => chain,
      coerce: {
        date: () => chain,
        number: () => chain
      }
    }
  }
})

vi.mock('h3-zod', () => ({
  useValidatedBody: mocks.useValidatedBody,
  z: mocks.z
}))

vi.mock('../../utils/db', () => ({
  useDB: mocks.useDB,
  tables: mocks.tables,
  sql: (strings: TemplateStringsArray) => strings.join('')
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq'))
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    tierLimits: {
      free: 200,
      premium: 500,
      enterprise: 10000
    }
  })
}))

describe('POST /api/purchases tier enforcement', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { requireUserSession?: unknown }).requireUserSession = mocks.requireUserSession
    ;(globalThis as { createError?: unknown }).createError = (input: { message: string }) => Object.assign(new Error(input.message), input)
    mocks.useDB.mockImplementation(() => mocks.dbClient)

    mocks.state.purchaseCount = 0
    mocks.state.measurements = []
    mocks.state.createdPurchase = { id: 101, userId: 'user-1' }
    mocks.state.createdSnapshot = { id: 202, purchaseEventId: 101, userId: 'user-1' }

    mocks.useValidatedBody.mockResolvedValue({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Sneaker',
      sizeLabel: '42'
    })
  })

  it('uses current user tier for limit checks', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1', tier: 'premium' } })
    mocks.state.purchaseCount = 500

    const { default: handler } = await import('./index.post')

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Purchase limit reached for your tier. Please upgrade to continue.'
    })
  })

  it('falls back to free tier when session tier is missing', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-2' } })
    mocks.state.purchaseCount = 200

    const { default: handler } = await import('./index.post')

    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('creates a purchase and measurement snapshot for a premium user below the limit', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-3', tier: 'premium' } })
    mocks.state.purchaseCount = 499
    mocks.state.measurements = [{
      id: 1,
      userId: 'user-3',
      recordedAt: new Date('2026-01-01T10:00:00.000Z')
    }]
    mocks.useValidatedBody.mockResolvedValue({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Sneaker',
      sizeLabel: '42',
      measurementId: 1
    })

    const { default: handler } = await import('./index.post')

    await expect(handler({} as never)).resolves.toEqual({
      purchase: mocks.state.createdPurchase,
      snapshot: mocks.state.createdSnapshot
    })

    expect(mocks.dbClient.insert).toHaveBeenCalledTimes(2)
    expect(mocks.dbClient.insert).toHaveBeenNthCalledWith(1, mocks.tables.purchaseEvents)
    expect(mocks.dbClient.insert).toHaveBeenNthCalledWith(2, mocks.tables.purchaseMeasurementSnapshots)
  })

  it('creates a purchase without a snapshot when no measurements exist and user is under the tier limit', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-4', tier: 'premium' } })
    mocks.state.purchaseCount = 499

    const { default: handler } = await import('./index.post')

    await expect(handler({} as never)).resolves.toEqual({
      purchase: mocks.state.createdPurchase,
      snapshot: null
    })

    expect(mocks.dbClient.insert).toHaveBeenCalledTimes(1)
    expect(mocks.dbClient.insert).toHaveBeenCalledWith(mocks.tables.purchaseEvents)
  })
})
