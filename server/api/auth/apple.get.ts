import { eq } from 'drizzle-orm'
import { db } from 'hub:db'
import * as schema from '../../database/schema'

const tables = schema

export default defineOAuthAppleEventHandler({
  config: {
    scope: 'name email'
  },
  async onSuccess(event, { user, payload }) {
    try {
      const config = useRuntimeConfig()

      // Get list of admin user IDs from environment
      const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()) || []

      // Namespace ID to avoid collisions with other providers
      const userId = `apple:${payload.sub}`
      const email = payload.email || user?.email
      const fullName = [user?.name?.firstName, user?.name?.lastName].filter(Boolean).join(' ').trim()
      const login = fullName || email || userId
      const isAdmin = adminUserIds.includes(userId)
        || adminUserIds.includes(payload.sub)
        || (email ? adminUserIds.includes(email) : false)

      // Check if user exists
      const existingUser = await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.id, userId))
        .get()

      let dbUser
      if (existingUser) {
      // Update existing user's updatedAt timestamp
        dbUser = await db
          .update(tables.users)
          .set({
            updatedAt: new Date(),
            // Promote existing user to admin when configured
            ...(isAdmin && existingUser.role !== 'admin' ? { role: 'admin' as const } : {})
          })
          .where(eq(tables.users.id, userId))
          .returning()
          .get()
      }
      else {
      // Create new user with free tier
        dbUser = await db
          .insert(tables.users)
          .values({
            id: userId,
            tier: 'free',
            role: isAdmin ? 'admin' : 'user',
            loginProvider: 'apple',
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning()
          .get()
      }

      // Set session with user data including tier and role
      await setUserSession(event, {
        user: {
          id: userId,
          login,
          email,
          role: dbUser.role,
          tier: dbUser.tier,
          loginProvider: 'apple'
        }
      })

      return sendRedirect(event, '/purchases')
    }
    catch (error) {
      console.error('[OAuth] Apple auth error:', error)
      throw createError({
        statusCode: 500,
        message: 'Authentication failed',
        cause: error
      })
    }
  }
})