# Coffee Shop Management System

The MVP implements the requirements in [docs/PRD.md](docs/PRD.md). The product starts in pre-opening state and keeps optional sample preparation records separate from genuine operating activity.

## Current implementation status

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md). The MVP modules are implemented locally; hosted deployment, email/Storage configuration and production recovery verification remain required before real operations.

The workspace uses grouped navigation, task search (Ctrl/Command+K), guided next steps and page-specific workflow explanations. See [the navigation and workflow guide](docs/UI_GUIDE.md).

## Seed pre-opening dummy data into Supabase

After applying migrations and creating your founder shop, run the entire [`supabase/seed.sql`](supabase/seed.sql) in your Supabase project's SQL Editor as `postgres`. It stores 3 categories, 6 products, 7 priced variants/recipes, and 13 ingredients directly in your shop, plus suppliers, planned purchases, budgets, pending funding/expense examples and a disabled sample device. Sign in normally and open `/app/menu` or `/app/recipes`. Rerunning the seed preserves edits. The browser-only demo pages have been removed. See [seeding and sample cleanup instructions](docs/SEED_DATA.md) before using [`supabase/reset-preopening-seed.sql`](supabase/reset-preopening-seed.sql) to remove the samples later.

## Local development

Requirements: Node.js 22.12 or later on a supported even-numbered release, and npm. The development machine uses Node.js 22.22.

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Apply SQL migrations in `supabase/migrations/` in order, using the Supabase CLI or SQL migration workflow.
4. Disable **Allow new users to sign up** in Supabase Auth, then create the initial founder's Auth account in Authentication > Users. The application has no public registration screen; the Supabase project setting must also be disabled. See [Supabase setup](docs/SUPABASE_SETUP.md).
5. Install and run: `npm ci`, `npm run dev`.

Commands: `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Browser checks: install Chromium once with `npx playwright install chromium`, run `npm run build`, then `npm run test:e2e`. Tests start the production build on port 3002, separately from your development server. Offline tests require versioned production assets; development chunks deliberately bypass service-worker caching. To use an installed Edge browser on Windows: `$env:PLAYWRIGHT_CHANNEL='msedge'; npm run test:e2e`.

Database checks: `./scripts/test-database.ps1 -PgBin 'C:\path\to\PostgreSQL\bin'`. The script initializes a marked, isolated PostgreSQL cluster under `.local/`, tests all migrations in a new temporary database, deletes that database, and stops the test server. It refuses to use an unrelated database directory. The test-only auth stub does not verify hosted Supabase Auth.

Menu preparation is available to founders at `/app/menu` and `/app/recipes`: categories, products, multiple variants, immutable price versions, ingredients, revised ingredient estimates, and versioned recipe snapshots. Creating an ingredient adds no stock. Publish a recipe before enabling a menu variant. Amounts based on ingredient estimates remain labelled estimated.

## Security model

Supabase Auth provides user identity. Server code uses the public anon key with the caller's cookie session; an optional server-only service-role key is used solely for founder-triggered account invitation emails. Business operations always use the caller session and database checks. PostgreSQL RLS scopes shop reads to active membership, founder-only shop/device writes are checked in SQL, and initial shop creation runs through a restricted authenticated RPC. Route checks are a usability layer; RLS is the data boundary. Apply migrations before using the app.

## Data and accounting rules

- PHP monetary values use integer centavos in domain logic.
- Business timestamps are stored in PostgreSQL as `timestamptz`; shop timezone defaults to `Asia/Manila` and can be configured.
- Shop setup defaults to `pre_opening`.
- An empty sales history is shown as not started, not as poor performance.
- Founder funding, budgets, purchase plans, expenses, payments, and sales must remain distinct domains.

## PWA and offline limitations

The current service worker caches the public app shell, hashed static scripts/styles, and an offline explanation. It excludes authenticated shop pages, auth endpoints, and API responses. Public-page offline refresh is covered by a browser test. The public `/pos` shell caches no authenticated HTML. Dexie durably stores scoped menu snapshots and queued orders; a paired designated device and a time-limited server session authorize offline checkout. Server processing is atomic and idempotent. See [operation and device recovery policies](docs/OPERATIONS.md).

## Dependency decisions

The Supabase SSR adapter is compatible with the current installed Supabase client. Next.js's nested PostCSS dependency is overridden to 8.5.32 to address reported advisories; production builds must pass whenever this override changes. Vitest 5 replaces vulnerable older test tooling and requires Node 22.12 or later ([official migration guide](https://vitest.dev/guide/migration/)). Commit `package-lock.json` when initializing version control and use `npm ci` for repeatable installations.

## Backup and restore

The database test runner performs a real isolated dump/restore drill and verifies restored records, RLS policies and history protections. Production Supabase backups and private Storage objects still require configured backup and an isolated hosted restore drill. POS recovery files can export/import unsynchronized orders; records lost before sync/export cannot be recovered. See [operations and launch instructions](docs/OPERATIONS.md).

## Authenticated browser/database verification

After `npm run build`, run `./scripts/test-database.ps1 -PgBin 'C:\path\to\PostgreSQL\bin' -FullStack` with `PLAYWRIGHT_CHANNEL=msedge` on Windows. This uses a local test-only Auth/REST contract adapter against the disposable real PostgreSQL database and checks all workspaces, a saved supplier, checkout and shift closure. It never changes `.env.local` or the configured hosted project. Hosted Supabase Auth/Storage and SMTP remain separate integration gates.

For focused development-mode runtime/navigation checks, set `PLAYWRIGHT_FULLSTACK_DEV=1` and run the database script with `-FullStackOnly -BrowserGrep 'dashboard client|workspace discovery'`. The development test build uses its own output folder and allows on-demand route compilation; production browser checks use the standard build.
