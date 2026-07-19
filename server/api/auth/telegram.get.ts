import { eq } from 'drizzle-orm'
import { db } from 'hub:db'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import * as schema from '../../database/schema'

const tables = schema

type TelegramLegacyAuthQuery = {
  id?: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date?: string
  hash?: string
}

function getDataCheckString(query: TelegramLegacyAuthQuery) {
  return Object.entries(query)
    .filter(([key, value]) => key !== 'hash' && typeof value === 'string' && value.length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function verifyTelegramAuth(query: TelegramLegacyAuthQuery, botToken: string) {
  if (!query.hash || !query.auth_date || !query.id) {
    return false
  }

  const maxAgeSeconds = 60 * 60 * 24 // 24h
  const authTimestamp = Number(query.auth_date)
  if (!Number.isFinite(authTimestamp)) {
    return false
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (nowSeconds - authTimestamp > maxAgeSeconds) {
    return false
  }

  const secretKey = createHash('sha256').update(botToken).digest()
  const checkString = getDataCheckString(query)
  const computedHash = createHmac('sha256', secretKey).update(checkString).digest('hex')

  const expected = Buffer.from(query.hash, 'hex')
  const actual = Buffer.from(computedHash, 'hex')

  if (expected.length !== actual.length) {
    return false
  }

  return timingSafeEqual(expected, actual)
}

export default eventHandler(async (event) => {
  try {
    const botToken = process.env.NUXT_OAUTH_TELEGRAM_BOT_TOKEN

    if (!botToken) {
      throw createError({
        statusCode: 500,
        message: 'Missing Telegram bot token for legacy login configuration'
      })
    }

    const query = getQuery<TelegramLegacyAuthQuery>(event)

    // Initial request should be served by /auth/telegram page
    if (!query.id || !query.hash) {
      return sendRedirect(event, '/auth/telegram')
    }

    if (!verifyTelegramAuth(query, botToken)) {
      throw createError({
        statusCode: 401,
        message: 'Telegram login failed: invalid authorization payload'
      })
    }

    const config = useRuntimeConfig()
    const adminUserIds = config.adminUserIds?.split(',').map((id: string) => id.trim()) || []

    const userId = `telegram:${query.id}`
    const fullName = `${query.first_name || ''} ${query.last_name || ''}`.trim()
    const login = query.username || fullName || userId
    const avatarUrl = query.photo_url
    const isAdmin = adminUserIds.includes(userId)
      || adminUserIds.includes(query.id)
      || (query.username ? adminUserIds.includes(query.username) : false)

    const existingUser = await db
      .select()
      .from(tables.users)
      .where(eq(tables.users.id, userId))
      .get()

    let dbUser
    if (existingUser) {
      dbUser = await db
        .update(tables.users)
        .set({
          updatedAt: new Date(),
          ...(isAdmin && existingUser.role !== 'admin' ? { role: 'admin' as const } : {})
        })
        .where(eq(tables.users.id, userId))
        .returning()
        .get()
    }
    else {
      dbUser = await db
        .insert(tables.users)
        .values({
          id: userId,
          tier: 'free',
          role: isAdmin ? 'admin' : 'user',
          loginProvider: 'telegram',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning()
        .get()
    }

    await setUserSession(event, {
      user: {
        id: userId,
        login,
        avatarUrl,
        role: dbUser.role,
        tier: dbUser.tier,
        loginProvider: 'telegram'
      }
    })

    return sendRedirect(event, '/purchases')
  }
  catch (error) {
    console.error('[OAuth] Telegram auth error:', error)
    throw createError({
      statusCode: 500,
      message: 'Authentication failed',
      cause: error
    })
  }
})