export default eventHandler((event) => {
  const rawBotUsername = process.env.NUXT_OAUTH_TELEGRAM_BOT_USERNAME
  const botUsername = rawBotUsername?.trim().replace(/^@/, '') || ''

  if (!botUsername) {
    throw createError({
      statusCode: 500,
      message: 'Missing Telegram bot username for legacy login widget'
    })
  }

  if (!/^[A-Za-z0-9_]{5,}$/.test(botUsername)) {
    throw createError({
      statusCode: 500,
      message: 'Invalid Telegram bot username. Use only the bot username (without @), e.g. my_bot_name'
    })
  }

  const callbackUrl = process.env.NUXT_OAUTH_TELEGRAM_REDIRECT_URL || new URL('/api/auth/telegram', getRequestURL(event).origin).toString()

  let origin = process.env.NUXT_OAUTH_TELEGRAM_ORIGIN
  if (!origin) {
    try {
      origin = new URL(callbackUrl).origin
    }
    catch {
      origin = getRequestURL(event).origin
    }
  }

  return {
    botUsername,
    callbackUrl,
    origin
  }
})
