import { eq } from 'drizzle-orm'
import { db } from 'hub:db'
import * as schema from '../../database/schema'

const tables = schema

export default defineOAuthGitHubEventHandler({
  async onSuccess(event, { user }) {
    try {
      const config = useRuntimeConfig()

      // Get list of admin user IDs from environment
      const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()) || []
      const isAdmin = adminUserIds.includes(String(user.id))

      // Check if user exists
      const existingUser = await db
        .select()
        .from(tables.users)
        .where(eq(tables.users.id, String(user.id)))
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
          .where(eq(tables.users.id, String(user.id)))
          .returning()
          .get()
      }
      else {
      // Create new user with free tier
        dbUser = await db
          .insert(tables.users)
          .values({
            id: String(user.id),
            tier: 'free',
            role: isAdmin ? 'admin' : 'user',
            loginProvider: 'github',
            createdAt: new Date(),
            updatedAt: new Date()
          })
          .returning()
          .get()
      }

      // Set session with user data including tier and role
      await setUserSession(event, {
        user: {
          ...user,
          id: String(user.id),
          tier: dbUser.tier,
          role: dbUser.role
        }
      })
      return sendRedirect(event, '/purchases')
    }
    catch (error) {
      console.error('[OAuth] GitHub auth error:', error)
      throw createError({
        statusCode: 500,
        message: 'Authentication failed',
        cause: error
      })
    }
  }
})
