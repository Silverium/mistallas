# Contributing to Mistallas

Welcome! This guide will help you set up your development environment and contribute to mistallas.

## Project Overview

Mistallas is a **clothing purchase tracker** built with:
- **Frontend**: Nuxt 4 with Nuxt UI
- **Backend**: Nitro (Nuxt's server engine)
- **Database**: Cloudflare D1 (SQLite) via NuxtHub
- **Auth**: OAuth (GitHub/Google)
- **Payments**: Stripe for tier upgrades
- **Deployment**: Cloudflare Workers

## Getting Started

### Prerequisites

- **Node.js**: v18+ (recommended: v20+)
- **pnpm**: v9+ (package manager)
- **Git**: For cloning and contributing
- **Cloudflare Account**: To deploy and manage D1 database
- **Stripe Account** (optional): For testing payment features

### 1. Clone the Repository

```bash
git clone https://github.com/Silverium/mistallas.git
cd mistallas
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# Session encryption (generate a random 32+ char string)
NUXT_SESSION_PASSWORD=your-random-32-char-secret-here

# OAuth (get from GitHub/Google developer console)
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret

GOOGLE_OAUTH_CLIENT_ID=your-google-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret

# Stripe (get from https://dashboard.stripe.com)
NUXT_STRIPE_SECRET_KEY=sk_test_...
NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NUXT_STRIPE_WEBHOOK_SECRET=whsec_...

# Admin user IDs (comma-separated: GitHub ID or Google email)
ADMIN_USER_IDS=your-github-id,your-email@gmail.com

# Optional: customize tier limits
NUXT_TIER_LIMIT_FREE=200
NUXT_TIER_LIMIT_PREMIUM=5000
NUXT_TIER_LIMIT_ENTERPRISE=10000
```

### 4. Initialize the Database

The database schema is in `server/database/schema.ts` and migrations are auto-applied on first run.

```bash
# Run development server (this applies migrations)
pnpm dev
```

Navigate to `http://localhost:3000` and log in with GitHub or Google.

## Development Workflow

### Running the Development Server

```bash
pnpm dev
```

This starts:
- Nuxt dev server on `http://localhost:3000` with HMR
- Nuxt DevTools at `/__nuxt_devtools__`
- Drizzle Studio (embedded in DevTools) to browse the database

### Running Tests

```bash
pnpm test

# Watch mode
pnpm run test:watch
```
or
```bash
npx vitest
```

### Running e2e Tests (Playwright)

```bash
# Requires a preview server already running (pnpm run preview)
pnpm test:e2e

# Preferred: builds + boots a fresh preview server, runs the tests, then
# tears it down. Use this when debugging a flaky e2e test or verifying a
# fix — it avoids false results from a stale build or a leftover
# wrangler/workerd process squatting on port 8787 from a previous run.
pnpm test:e2e:fresh e2e/preview/some.spec.ts
```

### Linting

```bash
pnpm lint

# Fix issues automatically
pnpm lint --fix
```

### Building for Production

```bash
pnpm build

# Preview locally with Wrangler (closer to production)
pnpm dev:local
```

## Project Structure Guide

```
.github/
  agents/
    contributor.agent.md      # This file!
  instructions/
    api-routes.instructions.md
    pages.instructions.md
    database-schema.instructions.md

app/
  pages/                       # Nuxt pages (file-based routing)
    index.vue                  # Home page
    account.vue                # User account & tier management
    purchases.vue              # Purchase history
    admin/users/               # Admin panel (role-based)
  middleware/
    auth.ts                    # Require login
    admin.ts                   # Require admin role
  queries/                     # Pinia Colada query definitions
  utils/                       # Client-side helpers
  composables/                 # Reusable Vue logic
  assets/main.css              # Global Tailwind styles

server/
  api/
    auth/                      # OAuth handlers
    purchases/                 # Purchase CRUD + tier validation
    measurements/              # Body measurements CRUD
    todos/                     # Todos CRUD
    admin/users/               # Admin-only user management
    account/                   # User profile, upgrade, downgrade
    webhooks/stripe.post.ts    # Stripe webhook handler
  database/schema.ts           # Drizzle table definitions (single source of truth)
  utils/
    db.ts                      # useDB(), tables, SQL helpers
    tiers.ts                   # Tier limit logic
    admin.ts                   # Admin auth helpers
    stripe.ts                  # Stripe utilities
  db/migrations/               # Auto-generated SQL migrations

shared/types/auth.d.ts         # User type definition
```

## Common Tasks

### Adding a New API Endpoint

1. Create file in `server/api/` using the naming convention:
   - `index.get.ts` → `GET /api/resource`
   - `index.post.ts` → `POST /api/resource`
   - `[id].patch.ts` → `PATCH /api/resource/:id`

2. Use the template from `.github/instructions/api-routes.instructions.md`

Example:

```typescript
// server/api/purchases/[id].delete.ts
import { eq } from 'drizzle-orm'
import { useDB, tables } from '../../utils/db'

export default eventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = parseInt(getRouterParam(event, 'id'))

  const purchase = await useDB()
    .select()
    .from(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.id, id))
    .get()

  if (!purchase || purchase.userId !== user.id) {
    throw createError({ statusCode: 403, message: 'Not found' })
  }

  await useDB()
    .delete(tables.purchaseEvents)
    .where(eq(tables.purchaseEvents.id, id))

  return { success: true }
})
```

### Adding a New Frontend Page

1. Create `.vue` file in `app/pages/` using file-based routing
2. Use Pinia Colada for data fetching
3. Use Nuxt UI components for the UI

Example:

```vue
<!-- app/pages/profile.vue -->
<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { data: profile } = useQuery({
  query: () => $fetch('/api/account/profile')
})
</script>

<template>
  <div class="container mx-auto p-4">
    <h1>My Profile</h1>
    <div v-if="profile">
      <p>Tier: {{ profile.tier }}</p>
      <p>Purchases: {{ profile.purchaseCount }} / {{ profile.limit }}</p>
    </div>
  </div>
</template>
```

### Adding a Database Column

1. Update `server/database/schema.ts`
2. Run `pnpm db:generate` to create a migration
3. Run `pnpm db:migrate:local` to test locally
4. When ready, run `pnpm db:migrate:remote` for production

See `.github/instructions/database-schema.instructions.md` for details.

### Implementing a New Feature

**Example**: Add a "Wishlist" feature

1. **Database**: Add `wishlistItems` table in `server/database/schema.ts`
2. **API**: Create endpoints in `server/api/wishlist/`
   - `index.get.ts` — List wishlist
   - `index.post.ts` — Add item
   - `[id].delete.ts` — Remove item
3. **Frontend**: Create `app/pages/wishlist.vue`
4. **Tests**: Add `server/api/wishlist/index.post.test.ts`
5. **Documentation**: Update this guide if new patterns emerge

## Code Style & Best Practices

### TypeScript
- Use strict mode (enabled by default)
- No `any` types — use `unknown` if needed
- Export types for reusability

### Naming Conventions
- Files: `kebab-case` (e.g., `user-profile.vue`, `get-tier-info.ts`)
- Classes & Types: `PascalCase` (e.g., `User`, `PurchaseEvent`)
- Variables & Functions: `camelCase` (e.g., `getUserPurchases`, `isAtLimit`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `DEFAULT_TIER_LIMIT`)

### Formatting
- Single quotes: `'string'` not `"string"`
- No trailing commas: `{ a: 1, b: 2 }`
- ESLint auto-fixes: `pnpm lint --fix`

### Database Queries
```typescript
// ✅ DO: Import from utils, use type-safe accessors
import { useDB, tables, eq } from '../../utils/db'

const user = await useDB()
  .select()
  .from(tables.users)
  .where(eq(tables.users.id, userId))
  .get()

// ❌ DON'T: Raw SQL strings or loose queries
const user = await db.raw('SELECT * FROM users WHERE id = ?', [userId])
```

### Error Handling
```typescript
// ✅ DO: Use createError for user-facing errors
throw createError({
  statusCode: 403,
  message: 'Purchase limit reached. Upgrade your tier.',
  data: { upgradeUrl: '/account' }
})

// ❌ DON'T: Throw raw errors or expose internal details
throw new Error('Database connection failed')
```

### Testing
```typescript
// ✅ DO: Test server logic (tiers, validation)
describe('tiers', () => {
  it('should enforce free tier limit', () => {
    expect(getPurchaseLimit('free')).toBe(200)
  })
})

// ❌ DON'T: Test Cloudflare-specific integrations
// (these are tested by Wrangler/NuxtHub)
```

## Troubleshooting

### `pnpm dev` hangs or crashes

```bash
# Clear cache and reinstall
rm -rf node_modules .nuxt
pnpm install
pnpm dev
```

### Database migrations not applying

```bash
# Check migration status
pnpm db:migrations:list:local

# Manually apply
pnpm db:migrate:local
```

### OAuth not working

- Verify `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set
- Check redirect URI in GitHub OAuth settings matches `http://localhost:3000` (dev) or your deployed URL
- Clear browser cookies and try again

### Build fails on production

```bash
# Test production build locally
pnpm build
pnpm dev:local

# Check Wrangler config
wrangler publish --dry-run
```

## Git Workflow

### Creating a Branch

```bash
git checkout -b feature/your-feature-name
# or: git checkout -b fix/your-bug-name
```

### Committing Changes

```bash
git add .
git commit -m "feat: add wishlist feature"
# or: git commit -m "fix: tier limit not enforced"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `refactor:` code restructuring
- `test:` test additions
- `docs:` documentation
- `chore:` maintenance

### Creating a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub. Include:
- Clear description of changes
- Link to related issues
- Screenshots if UI changes
- Test results

## Resources

- [Nuxt Documentation](https://nuxt.com)
- [Nuxt UI](https://ui.nuxt.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Cloudflare D1](https://developers.cloudflare.com/d1/)
- [Stripe API](https://stripe.com/docs/api)
- [Pinia Colada](https://pinia-colada.esm.dev)

## Need Help?

- Open an issue on [GitHub](https://github.com/Silverium/mistallas/issues)
- Check existing issues for similar questions
- Share your environment details (OS, Node version, etc.)

## License

This project is licensed under the [MIT License](LICENSE).

Happy coding! 🚀
