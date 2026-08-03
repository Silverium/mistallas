## Features

- [Server-Side Rendering on the Edge](https://nuxt.com/blog/nuxt-on-the-edge)
- Authentication backed-in using [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils)
- Leverage [Cloudflare D1](https://developers.cloudflare.com/d1/) as database with [drizzle ORM](https://orm.drizzle.team/) using [`hubDatabase()`](https://hub.nuxt.com/docs/storage/database)
- [Automatic database migrations](https://hub.nuxt.com/docs/features/database#database-migrations) in development & when deploying
- User interface made with [Nuxt UI](https://ui.nuxt.com)
- Embed [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview/) in the [Nuxt DevTools](https://devtools.nuxt.com)
- Cache invalidation and Optimistic UI with [Pinia Colada](https://pinia-colada.esm.dev)

## Live demo

https://mistallas.mistallas.workers.dev/

## Setup

Make sure to install the dependencies using [pnpm](https://pnpm.io/):

```bash
pnpm i
```

Create a [GitHub Oauth Application](https://github.com/settings/applications/new) with:
- Homepage url: `http://localhost:3000`
- Callback url: `http://localhost:3000/api/auth/github`

Create a Google OAuth app with callback URL:
- `http://localhost:3000/api/auth/google`

Create an Instagram app with callback URL:
- `http://localhost:3000/api/auth/instagram`

> Note: Instagram Login currently targets professional accounts (Business or Creator).

Create an Apple Sign In app/service with callback URL:
- `http://localhost:3000/api/auth/apple`

Create a Telegram bot in @BotFather and configure legacy Login Widget:
- Run `/setdomain` and set your app origin (for local dev, use a public HTTPS tunnel origin)
- Use callback URL: `http://localhost:3000/api/auth/telegram` (or your public tunnel callback)

Add the variables in the `.env` file:

```bash
NUXT_OAUTH_GITHUB_CLIENT_ID="my-github-oauth-app-id"
NUXT_OAUTH_GITHUB_CLIENT_SECRET="my-github-oauth-app-secret"
NUXT_OAUTH_GOOGLE_CLIENT_ID="my-google-oauth-client-id"
NUXT_OAUTH_GOOGLE_CLIENT_SECRET="my-google-oauth-client-secret"
NUXT_OAUTH_INSTAGRAM_CLIENT_ID="my-instagram-oauth-client-id"
NUXT_OAUTH_INSTAGRAM_CLIENT_SECRET="my-instagram-oauth-client-secret"
NUXT_OAUTH_APPLE_CLIENT_ID="my-apple-service-id"
NUXT_OAUTH_APPLE_TEAM_ID="my-apple-team-id"
NUXT_OAUTH_APPLE_KEY_ID="my-apple-key-id"
NUXT_OAUTH_APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
NUXT_OAUTH_TELEGRAM_BOT_USERNAME="my_bot_username" # bot username only, without @
NUXT_OAUTH_TELEGRAM_BOT_TOKEN="123456789:AA..."
NUXT_OAUTH_TELEGRAM_REDIRECT_URL="http://localhost:3000/api/auth/telegram"
NUXT_OAUTH_TELEGRAM_ORIGIN="http://localhost:3000" # optional override; should match /setdomain origin
```

To create sealed sessions, you also need to add `NUXT_SESSION_PASSWORD` in the `.env` with at least 32 characters:

```bash
NUXT_SESSION_PASSWORD="your-super-long-secret-for-session-encryption"
```

## Development

Start the development server on http://localhost:3000

```bash
npm run dev
```


## Remote Storage

Once you deployed your project, you can connect to your remote database locally running:
  
```bash
pnpm dev --remote
```

Learn more about remote storage on https://hub.nuxt.com/docs/getting-started/remote-storage

## ⚠️ License Notice

This repository is **NOT open-source software**. 

While the source code is publicly viewable for transparency and evaluation, all rights are reserved by the author. You **cannot** take this code, deploy it to the internet, or use it to run a competing application or service. 

Please read the full [LICENSE](LICENSE) file for deployment and monetization restrictions.
