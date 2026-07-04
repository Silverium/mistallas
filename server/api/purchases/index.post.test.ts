import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useValidatedBody = vi.fn()
  const useDB = vi.fn()
  const requireUserSession = vi.fn()

  const state = {
    purchaseCount: 0,
    measurements: [] as Array<{ id: number, userId: string, recordedAt: Date }>
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
      premium: 5000,
      enterprise: Infinity
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

    mocks.useValidatedBody.mockResolvedValue({
      brand: 'Nike',
      category: 'Shoes',
      productType: 'Sneaker',
      sizeLabel: '42'
    })
  })

  it('uses current user tier for limit checks', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1', tier: 'premium' } })
    mocks.state.purchaseCount = 5000

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

  it('does not tier-block premium user below limit and continues business flow', async () => {
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-3', tier: 'premium' } })
    mocks.state.purchaseCount = 4999

    const { default: handler } = await import('./index.post')

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 400,
      message: 'A measurement is required before logging a purchase.'
    })
  })
})
