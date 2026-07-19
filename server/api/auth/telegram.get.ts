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

function normalizeBotUsername(value: string) {
  return value.trim().replace(/^@/, '')
}

function isValidBotUsername(value: string) {
  return /^[A-Za-z0-9_]{5,}$/.test(value)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveCallbackUrl(event: Parameters<typeof getRequestURL>[0]) {
  if (process.env.NUXT_OAUTH_TELEGRAM_REDIRECT_URL) {
    return process.env.NUXT_OAUTH_TELEGRAM_REDIRECT_URL
  }

  return getRequestURL(event).toString()
}

function resolveOrigin(event: Parameters<typeof getRequestURL>[0], callbackUrl: string) {
  if (process.env.NUXT_OAUTH_TELEGRAM_ORIGIN) {
    return process.env.NUXT_OAUTH_TELEGRAM_ORIGIN
  }

  try {
    return new URL(callbackUrl).origin
  }
  catch {
    return getRequestURL(event).origin
  }
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

function renderTelegramWidgetPage(botUsername: string, callbackUrl: string, origin: string) {
  const escapedUsername = escapeHtml(botUsername)
  const escapedCallback = escapeHtml(callbackUrl)
  const escapedOrigin = escapeHtml(origin)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Telegram Login</title>
    <style>
      body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f7f7f7; }
      .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.08); text-align: center; max-width: 520px; }
      p { color: #555; margin: 8px 0 16px; }
      code { font-size: 12px; background: #f1f3f5; padding: 2px 6px; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Sign in with Telegram</h2>
      <p>Domain configured in BotFather should match: <code>${escapedOrigin}</code></p>
      <script async src="https://telegram.org/js/telegram-widget.js?24"
        data-telegram-login="${escapedUsername}"
        data-size="large"
        data-auth-url="${escapedCallback}"
        data-request-access="write"></script>
    </div>
  </body>
</html>`
}

export default eventHandler(async (event) => {
  try {
    const botToken = process.env.NUXT_OAUTH_TELEGRAM_BOT_TOKEN
    const botUsername = process.env.NUXT_OAUTH_TELEGRAM_BOT_USERNAME
    const normalizedBotUsername = botUsername ? normalizeBotUsername(botUsername) : ''
    const callbackUrl = resolveCallbackUrl(event)
    const origin = resolveOrigin(event, callbackUrl)

    if (!botToken) {
      throw createError({
        statusCode: 500,
        message: 'Missing Telegram bot token for legacy login configuration'
      })
    }

    const query = getQuery<TelegramLegacyAuthQuery>(event)

    // No Telegram callback yet -> render legacy widget page
    if (!query.id || !query.hash) {
      if (!normalizedBotUsername) {
        throw createError({
          statusCode: 500,
          message: 'Missing Telegram bot username for legacy login widget'
        })
      }

      if (!isValidBotUsername(normalizedBotUsername)) {
        throw createError({
          statusCode: 500,
          message: 'Invalid Telegram bot username. Use only the bot username (without @), e.g. my_bot_name'
        })
      }

      setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
      return renderTelegramWidgetPage(normalizedBotUsername, callbackUrl, origin)
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