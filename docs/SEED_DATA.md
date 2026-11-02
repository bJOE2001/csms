# Pre-opening data in Supabase

Updated: 2026-10-29

The browser-only demo has been removed. Sample records now come from an optional SQL seeder and appear in the normal signed-in application through the normal signed-in preparation modules.

## Run the seeder

1. Apply every pending file in `supabase/migrations/` in order (currently ten migrations) if they have not already been applied.
2. Create your founder account through Supabase Authentication, sign in to the application, and finish **Set up shop**. The seeder uses this existing account and shop; it creates no passwords, Auth users, or memberships.
3. In the intended Supabase development/pre-opening project, open **SQL Editor**, choose the `postgres` database role, paste the entire contents of [`supabase/seed.sql`](../supabase/seed.sql), and run it. The Dashboard supports ad-hoc SQL execution ([Supabase database documentation](https://supabase.com/docs/guides/database/overview)).
4. Expect `seed_result` with `status: seeded`. Refresh `/app/menu` and `/app/recipes` while signed in as a founder.

The default target is the only pre-opening shop with an active founder. If there are multiple eligible shops, uncomment the `csms.seed_shop_id` configuration line near the top of the file and insert your shop UUID. An optional `csms.seed_founder_id` selects a specific active founder to attribute the sample publications to. Otherwise, the shop creator is preferred when they are still an active founder.

The script requires an empty menu and ingredient list on its first run. It refuses to merge with existing records. A rerun returns `already_seeded` and preserves all sample edits and version history. Inserts, price publication, recipe-cost snapshots, and the seed manifest are committed together. A failure rolls back the entire seed transaction.

Do not add this seed to production deployment commands. Supabase normally automatically executes a root `seed.sql` during local startup/reset ([seeding documentation](https://supabase.com/docs/guides/local-development/seeding-your-database)); this project-specific script requires founder/shop setup first and is intended for manual execution afterward.

## Included records

| Records | Samples |
| --- | --- |
| 3 categories | Espresso bar, Coffee-free, Pastries |
| 6 products | Americano, Café Latte, Mocha, Vanilla Latte, Matcha Latte, Butter Croissant |
| 7 variants and initial price versions | Hot/iced drink sizes and one pastry; PHP 95–170 |
| 13 ingredients | Beans, milks, sauces, matcha, water, ice, packaging, pastry |
| 7 published recipe versions | Quantities, waste allowances, immutable estimated-cost snapshots |

These are fictional preparation values. Vanilla syrup deliberately has no cost estimate, demonstrating unavailable recipe costing. Ingredient thresholds create no physical stock. Sample variants start unavailable so you can review recipes and prices before enabling them. The shop name, timezone, accounts, memberships, and devices are preserved.

POS, order, inventory movement, payment and cashier-shift workflows are implemented, but the default pre-opening seed deliberately leaves operational history empty. Register/pair the real POS device, enter actual stock and open a real shift before using checkout.

The extended preparation seed also adds 3 fictional suppliers, 3 planned purchases, 5 startup budgets (PHP 200,000 total), 3 pending founder-funding examples, 2 pending expense examples and a disabled sample POS device. Funding classifications cover capital, loans and reimbursable payments. No sample is approved or confirmed, and no purchase is received. Review them as examples and remove them before entering genuine activity.

The script upgrades an earlier menu-only seed by recording a separate extended manifest; existing menu edits remain intact. Repeated execution adds neither duplicate preparation records nor extra versions.

## Remove samples before genuine configuration

Run the entire [`supabase/reset-preopening-seed.sql`](../supabase/reset-preopening-seed.sql) manually as `postgres` in the same project's SQL Editor. If multiple shops exist, set its `csms.seed_shop_id` line to the seeded shop UUID. Expect `cleanup_result` with `status: removed` (or `nothing_to_remove` on a repeat).

Cleanup removes only the category/product/variant/ingredient and extended preparation IDs recorded by this seeder and all price/recipe versions under the seeded variants, including your subsequent edits to those samples. It also removes the disabled sample device. It preserves accounts, profiles, shop settings, membership, real devices, unrelated configuration, and append-only audit history. It refuses any sample funding/expense that has been confirmed/approved/reversed or purchase that has been received. It refuses if non-sample products/variants/recipes depend on sample categories/products/ingredients. Future foreign-key dependencies also cause an atomic rollback rather than cascading deletion. Cleanup is restricted to a shop still in `pre_opening` state.

The administrator script temporarily disables the three immutable configuration triggers and two financial delete guards for exact tracked sample IDs inside the locked transaction, deletes scoped sample history, and reenables them before commit. The audit trigger is never disabled. Any error rolls back both deletes and trigger changes. No cleanup endpoint or privileged key is added to the application.

For a completely empty production database, including no test audit history, use a separate fresh Supabase production project, apply schema migrations only, provision real accounts, and configure the production environment variables. Do not run the seeder there.

## Verification

`scripts/test-database.ps1` runs the actual seed and cleanup SQL against an isolated PostgreSQL database. Checks cover dataset counts, SQL-calculated cost snapshots, repeatability without losing edits, ambiguous targets, nonempty-menu refusal, cleanup isolation, retained identity/audit records, preserved immutable triggers, reseeding after cleanup, and rollback when genuine configuration depends on samples. Hosted execution still requires the project administrator's SQL Editor or a private database connection; the public anon key cannot perform administrator cleanup.
