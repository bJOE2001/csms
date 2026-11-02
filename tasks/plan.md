# Implementation plan

## Full MVP completion — 2026-10-29

The user authorized completion of all PRD modules followed by an expanded Supabase seeder. The capability/dependency map is `docs/CAPABILITIES.md`; executable acceptance/verification tasks are tracked in `tasks/todo.md`. Use additive migrations and retain real user/shop records. The approved inventory costing method is moving weighted average, with exact integer-centavo inventory value conserved across consumption; unknown opening values remain explicitly unavailable. Default seeding remains pre-opening preparation, without invented sales or receipts. Finish locally verifiable implementation and tests autonomously; report external hosted verification gates accurately.

The module implementations and extended pre-opening seeder are now complete locally. The latest verification and hosted deployment gates are recorded in `docs/IMPLEMENTATION_STATUS.md`; the sections below retain the earlier increment history.

## Original repository assessment

The repository contains only `docs/PRD.md` (draft v1.0, 28,487 bytes). No application source, package manifest, migrations, environment template, tests, or existing conventions are present. The working directory is not a Git repository, so branch/commit save points are unavailable.

## Initial increment

1. Scaffold strict TypeScript Next.js App Router with Tailwind and a no-fabricated-data pre-opening landing page.
2. Add shared integer-centavo/formatting rules and deterministic unit tests.
3. Add Supabase browser/server clients, middleware session refresh, and protected application layout boundaries without service-role credentials.
4. Add the first versioned PostgreSQL migration for shop identity, membership, and RLS helpers/policies; document that deployment requires applying it and configuring Supabase.
5. Add PWA manifest/service worker foundation, `.env.example`, README, and implementation status.
6. Run available install, lint, typecheck, test, and production build commands. Fix issues attributable to this increment.

## Capability order

`identity → menu-recipes → operations → offline-sync → finance → reporting`

Each later slice must have its own acceptance criteria and tests. Do not describe the system as production-ready until the PRD's security, transaction, offline recovery, and backup gates have passed with configured infrastructure.

## Menu and recipe increment

- Add founder-only management pages at `/app/menu` and `/app/recipes` with shared server membership checks.
- Add shop-scoped categories, products, variants, immutable price versions, ingredients, immutable recipe versions/items, and append-only audit logs.
- Route every mutation through an authenticated SQL function; use composite foreign keys to prevent cross-shop references. Serialize version publication per variant.
- Preserve ingredient name/unit/cost snapshots in each recipe version and label all derived costs estimated or unavailable. No costing method is declared authoritative.
- Validate decimal strings without floating-point arithmetic, and test money parsing, recipe costing, missing estimates, duplicate ingredients, and invalid inputs.
- Verify local checks after repairing the interrupted dependency installation. Database RLS/RPC execution remains a separate integration gate until a Supabase project or local PostgreSQL is configured.

## Completed session evidence

The identity/menu/recipe migrations and founder management UI are implemented. An isolated local PostgreSQL 15 cluster now verifies all migrations and permission/history/precision invariants through `scripts/test-database.ps1`. Lint, typecheck, 9 unit tests, production build, 4 production browser smoke tests, and a full dependency audit pass. The configured Supabase Auth endpoint is reachable, but remote migration versions and a founder session remain unverified. The project currently permits public signup and needs the internal-access setting applied by its administrator.

The next implementation slice remains the POS/device/payment/inventory path, followed by durable offline queue and idempotent synchronization. Hosted configuration verification is an integration gate, not a reason to fabricate transactions or mark unfinished modules complete.

## Supabase pre-opening seeder (replaces browser demo)

The user clarified that dummy data must be stored directly in Supabase. Remove the browser-only demo route, components, IndexedDB implementation, styles, tests, and environment flag. Add an optional transactional SQL seeder using the existing founder shop and publication functions. Seed only implemented menu/ingredient/recipe tables. Refuse existing non-sample configuration, ambiguous targets, and operating shops; reruns preserve edits. Record exact sample root IDs in append-only audit history. Supply an administrator-only scoped cleanup script that preserves identity, unrelated records and audit history, refuses genuine dependencies, and restores immutable history protections transactionally.

Implementation: `supabase/seed.sql`, `supabase/reset-preopening-seed.sql`, isolated SQL regression coverage, and `docs/SEED_DATA.md`. Hosted execution requires SQL Editor administrator access; `.env.local` contains only the public URL and key. Verification results are tracked in `docs/IMPLEMENTATION_STATUS.md`.

Verified replacement: lint, typecheck, 10 unit tests, production build, 5 production browser checks, and the isolated PostgreSQL security/seed/cleanup regression suite passed. No hosted sample insert or cleanup was performed. All previous demo source files and the demo environment flag are removed.

## Initial acceptance criteria

- An unauthenticated visitor sees only a sign-in entry point; authenticated shop data is queried through the signed-in Supabase session and RLS.
- The initial dashboard describes pre-opening readiness and explicitly reports that sales history does not exist.
- All monetary domain helpers use integer cents; no floating-point value is used as authoritative currency.
- Shop records have owner/member boundaries enforced in PostgreSQL, with founder-only data policy ready for later domains.
- No production records or credentials are fabricated.
- Baseline lint, typecheck, unit tests, and build pass when dependencies can be installed.
