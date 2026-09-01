import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const useDB = vi.fn()
  const requireAdminAccess = vi.fn()
  const useValidatedParams = vi.fn()
  const useValidatedBody = vi.fn()

  const state = {
    updatedCategory: null as { id: number, name: string, verified: number, createdByUserId: string | null } | null
  }

  const tables = {
    categories: { __table: 'categories' }
  }

  const dbClient = {
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({
          returning: () => ({
            get: async () => state.updatedCategory
          })
        })
      })
    }))
  }

  const chain = {
    literal: () => chain
  }

  return {
    useDB,
    dbClient,
    tables,
    state,
    requireAdminAccess,
    useValidatedParams,
    useValidatedBody,
    z: { literal: () => chain },
    zh: { intAsString: 'intAsString' }
  }
})

vi.mock('h3-zod', () => ({
  useValidatedParams: mocks.useValidatedParams,
  useValidatedBody: mocks.useValidatedBody,
  z: mocks.z,
  zh: mocks.zh
}))

vi.mock('@root/server/utils/db', () => ({
  useDB: mocks.useDB,
  tables: mocks.tables
}))

vi.mock('@root/server/utils/admin', () => ({
  requireAdminAccess: mocks.requireAdminAccess
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => Symbol('eq'))
}))

describe('PATCH /api/admin/categories/:id', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    ;(globalThis as { eventHandler?: unknown }).eventHandler = (fn: unknown) => fn
    ;(globalThis as { createError?: unknown }).createError = (input: { message: string }) => Object.assign(new Error(input.message), input)

    mocks.useDB.mockImplementation(() => mocks.dbClient)
    mocks.requireAdminAccess.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mocks.useValidatedParams.mockResolvedValue({ id: 7 })
    mocks.useValidatedBody.mockResolvedValue({ verified: true })

    mocks.state.updatedCategory = null
  })

  it('requires admin access', async () => {
    mocks.state.updatedCategory = { id: 7, name: 'Bici', verified: 1, createdByUserId: 'user-1' }

    const { default: handler } = await import('./[id].patch')
    await handler({} as never)

    expect(mocks.requireAdminAccess).toHaveBeenCalledTimes(1)
  })

  it('marks the category verified and returns it', async () => {
    mocks.state.updatedCategory = { id: 7, name: 'Bici', verified: 1, createdByUserId: 'user-1' }

    const { default: handler } = await import('./[id].patch')

    await expect(handler({} as never)).resolves.toEqual({
      id: 7,
      name: 'Bici',
      verified: true,
      createdByUserId: 'user-1'
    })
  })

  it('throws 404 when the category does not exist', async () => {
    mocks.state.updatedCategory = null

    const { default: handler } = await import('./[id].patch')

    await expect(handler({} as never)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Category not found'
    })
  })
})
