import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useDB = vi.fn()
  const requireAdminAccess = vi.fn()

  const state = {
    categoryRows: [] as Array<{ id: number, name: string, verified: number, createdByUserId: string | null }>,
    usageRows: [] as Array<{ category: string, count: number }>
  }

  const tables = {
    categories: { __table: 'categories' },
    purchaseEvents: { __table: 'purchaseEvents' }
  }

  const dbClient = {
    select: vi.fn((projection?: unknown) => ({
      from: (table: { __table: string }) => ({
        orderBy: () => ({
          all: async () => state.categoryRows
        }),
        groupBy: () => ({
          all: async () => {
            if (table === tables.purchaseEvents && projection)
              return state.usageRows
            return []
          }
        })
      })
    }))
  }

  return { useDB, dbClient, tables, state, requireAdminAccess }
})

vi.mock('@root/server/utils/db', () => ({
  useDB: mocks.useDB,
  tables: mocks.tables
}))

vi.mock('@root/server/utils/admin', () => ({
  requireAdminAccess: mocks.requireAdminAccess
}))

vi.mock('drizzle-orm', () => ({
  asc: vi.fn(() => Symbol('asc')),
  sql: (strings: TemplateStringsArray) => strings.join('')
}))

describe('GET /api/admin/categories', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    mocks.useDB.mockImplementation(() => mocks.dbClient)
    mocks.requireAdminAccess.mockResolvedValue({ id: 'admin-1', role: 'admin' })

    mocks.state.categoryRows = []
    mocks.state.usageRows = []
  })

  it('requires admin access', async () => {
    const { default: handler } = await import('./index.get')

    await handler({} as never)

    expect(mocks.requireAdminAccess).toHaveBeenCalledTimes(1)
  })

  it('merges usage counts and coerces verified to a boolean', async () => {
    mocks.state.categoryRows = [
      { id: 1, name: 'Bici', verified: 0, createdByUserId: 'user-1' },
      { id: 2, name: 'Ropa', verified: 1, createdByUserId: null }
    ]
    mocks.state.usageRows = [{ category: 'Bici', count: 3 }]

    const { default: handler } = await import('./index.get')

    await expect(handler({} as never)).resolves.toEqual({
      categories: [
        { id: 1, name: 'Bici', verified: false, createdByUserId: 'user-1', usageCount: 3 },
        { id: 2, name: 'Ropa', verified: true, createdByUserId: null, usageCount: 0 }
      ]
    })
  })
})
