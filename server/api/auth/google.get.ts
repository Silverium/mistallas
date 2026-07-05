import { eq } from 'drizzle-orm'
import { eventHandler, getQuery, getRequestURL, sendRedirect } from 'h3'
import { db } from 'hub:db'
import * as schema from '../../database/schema'
import {
  consumeOAuthReturnHostCookie,
  getOAuthRedirectURLForHost,
  getOAuthReturnRedirectURL,
  setOAuthReturnHostCookie
} from '../../utils/oauth'

const tables = schema

const onGoogleOAuthSuccess: NonNullable<Parameters<typeof defineOAuthGoogleEventHandler>[0]['onSuccess']> = async (event, { user }) => {
  try {
    const config = useRuntimeConfig()

    // Get list of admin user IDs/emails from environment
    const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()) || []

    // Use email as user ID for Google
    const userId = user.email
    const isAdmin = adminUserIds.includes(userId)

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
          loginProvider: 'google',
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
        tier: dbUser.tier,
        role: dbUser.role
      }
    })

    return sendRedirect(
      event,
      getOAuthReturnRedirectURL(consumeOAuthReturnHostCookie(event), '/purchases')
    )
  }
  catch (error) {
    console.error('[OAuth] Google auth error:', error)
    throw createError({
      statusCode: 500,
      message: 'Authentication failed',
      cause: error
    })
  }
}

export default eventHandler((event) => {
  const query = getQuery(event)
  if (!query.code && !query.error) {
    setOAuthReturnHostCookie(event)
  }

  const redirectURL = getOAuthRedirectURLForHost(getRequestURL(event).host, 'google')

  return defineOAuthGoogleEventHandler({
    config: redirectURL ? { redirectURL } : undefined,
    onSuccess: onGoogleOAuthSuccess
  })(event)
})
