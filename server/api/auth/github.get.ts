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

const onGitHubOAuthSuccess: NonNullable<Parameters<typeof defineOAuthGitHubEventHandler>[0]['onSuccess']> = async (event, { user }) => {
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
      // Update existing user's updatedAt timestamp and promote to admin if configured
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

    return sendRedirect(
      event,
      getOAuthReturnRedirectURL(consumeOAuthReturnHostCookie(event), '/purchases')
    )
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

export default eventHandler((event) => {
  const query = getQuery(event)
  // Initial OAuth request detection: callback requests include `state` and/or `code`/`error` query params.
  if (!query.code && !query.error && !query.state) {
    setOAuthReturnHostCookie(event)
  }

  const redirectURL = getOAuthRedirectURLForHost(getRequestURL(event).host, 'github')

  return defineOAuthGitHubEventHandler({
    config: redirectURL ? { redirectURL } : undefined,
    onSuccess: onGitHubOAuthSuccess
  })(event)
})
