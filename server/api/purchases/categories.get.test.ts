import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useDB = vi.fn()
  const requireUserSession = vi.fn()

  const state = {
    rows: [] as Array<{ id: number, name: string, verified: number }>,
    shouldThrow: false
  }

  const tables = {
    categories: { __table: 'categories' }
  }

  const dbClient = {
    select: vi.fn(() => ({
      from: () => ({
        orderBy: () => ({
          all: async () => {
            if (state.shouldThrow) {
              throw new Error('D1 unavailable')
            }
            return state.rows
          }
        })
      })
    }))
  }

  return { useDB, dbClient, tables, state, requireUserSession }
})

vi.mock('@root/server/utils/db', () => ({
  useDB: mocks.useDB,
  tables: mocks.tables
}))

vi.mock('drizzle-orm', () => ({
  asc: vi.fn(() => Symbol('asc')),
  desc: vi.fn(() => Symbol('desc'))
}))

describe('GET /api/purchases/categories', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { requireUserSession?: unknown }).requireUserSession = mocks.requireUserSession
    mocks.useDB.mockImplementation(() => mocks.dbClient)
    mocks.requireUserSession.mockResolvedValue({ user: { id: 'user-1' } })

    mocks.state.rows = []
    mocks.state.shouldThrow = false
  })

  it('returns categories with verified coerced to a boolean', async () => {
    mocks.state.rows = [
      { id: 1, name: 'Ropa', verified: 1 },
      { id: 2, name: 'Bici', verified: 0 }
    ]

    const { default: handler } = await import('./categories.get')

    await expect(handler({} as never)).resolves.toEqual({
      categories: [
        { id: 1, name: 'Ropa', verified: true },
        { id: 2, name: 'Bici', verified: false }
      ]
    })
  })

  it('returns an empty list instead of throwing when the query fails', async () => {
    mocks.state.shouldThrow = true

    const { default: handler } = await import('./categories.get')

    await expect(handler({} as never)).resolves.toEqual({ categories: [] })
  })
})
