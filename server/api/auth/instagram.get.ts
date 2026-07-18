import { eq } from 'drizzle-orm'
import { db } from 'hub:db'
import * as schema from '../../database/schema'

const tables = schema

export default defineOAuthInstagramEventHandler({
  config: {
    // Meta renamed scopes from business_* to instagram_business_*.
    // We cast here because current nuxt-auth-utils types still expose the legacy names.
    scope: ['instagram_business_basic' as unknown as 'business_basic'],
    fields: ['id', 'username', 'profile_picture_url']
  },
  async onSuccess(event, { user }) {
    try {
      const config = useRuntimeConfig()

      // Get list of admin user IDs from environment
      const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()) || []

      // Namespace ID to avoid collisions with other providers that may share numeric IDs
      const userId = `instagram:${String(user.id)}`
      const isAdmin = adminUserIds.includes(String(user.id)) || adminUserIds.includes(userId)

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
            loginProvider: 'instagram',
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
          id: userId,
          login: user.username,
          role: dbUser.role,
          tier: dbUser.tier,
          loginProvider: 'instagram',
          avatarUrl: user.profile_picture_url
        }
      })
      return sendRedirect(event, '/purchases')
    }
    catch (error) {
      console.error('[OAuth] Instagram auth error:', error)
      throw createError({
        statusCode: 500,
        message: 'Authentication failed',
        cause: error
      })
    }
  }
})