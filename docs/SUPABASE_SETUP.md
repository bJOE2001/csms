# Supabase setup and verification

## Environment

Keep `.env.local` untracked. It contains `NEXT_PUBLIC_SUPABASE_URL` and the project's anon/public publishable key in `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Never put a service-role or secret key in a variable beginning with `NEXT_PUBLIC_`.

The existing public pair remains the default. Server deployments or isolated integration runs can optionally set `SUPABASE_URL` and `SUPABASE_ANON_KEY` together as runtime overrides. These are the same URL/anon credentials, not a service-role key. The test runner supplies its local pair automatically; no change to your `.env.local` is required for the UI update.

The configured project's Auth endpoint was reachable on 2026-10-28. Anonymous reads of the checked business endpoints were denied. These checks did not authenticate a founder and cannot establish the deployed migration version.

## Internal account access

In the Supabase project's Auth configuration, turn off **Allow new users to sign up** and keep anonymous sign-ins disabled. Supabase documents that disabling signup permits only existing accounts to sign in ([general configuration](https://supabase.com/docs/guides/auth/general-configuration)). Hiding registration in the application does not change that project setting.

At the last read-only check on 2026-10-28, public signup was enabled on the configured project. This requires a project administrator to change the setting; the public key used by the application cannot do so.

Create the initial founder account in Authentication > Users. Use its email/password at `/sign-in`, then select **Set up shop**. The authenticated `create_shop` RPC creates the pre-opening shop and founder membership atomically. Staff membership, verified-email invitations and password recovery are implemented. Configure the hosted Auth redirect URLs, SMTP and email templates before relying on email delivery; see `OPERATIONS.md`.

## Versioned database setup

Apply pending files in `supabase/migrations/` in filename order using the Supabase migration workflow. For manual initial setup, run each whole pending file in the project's SQL editor. Do not rerun already applied files or edit a file that has been applied; retain the application history using the Supabase CLI's migration tracking for deployments.

1. `202610280001_identity_and_shop_security.sql`: profiles, shops, membership, device registration, and initial RLS.
2. `202610280002_menu_recipes_and_audit.sql`: categories, products/variants, immutable prices, ingredients, versioned recipes/items, audit ledger, founder mutation RPCs, and RLS.
3. `202610280003_identity_integrity.sql`: concurrent shop-bootstrap protection, shop identity/timezone validation, identity audit triggers, and device preservation.
4. `202610290004_inventory_and_purchasing.sql`: supplier/purchase workflows, stock ledger, moving weighted average and idempotent business commands.
5. `202610290005_finance_shifts_and_settings.sql`: classified budgets/funding/expenses, approvals, shifts/cash requests, settings, membership safety and private receipt policies.
6. `202610290006_pos_orders_and_reconciliation.sql`: sessions, atomic checkout, payments, immutable consumption, refunds/returns and sequence-aware shift closing.
7. `202610290007_reporting_and_workspace_reads.sql`: safe role-specific workspace reads and shop-timezone financial reports.
8. `202610290008_membership_invitations.sql`: expiring verified-email acceptance and revocation.
9. `202610290009_device_pairing_and_dashboard.sql`: paired offline browser, session rollover and dashboard summaries.
10. `202610290010_shift_review.sql`: audited review of finalized unresolved cash reconciliation.

The application URL/public key allow data access under RLS; they do not authorize applying schema migrations. No remote schema changes have been performed by this chat.

If 001–003 are already applied and none of 004–010 are applied, `.local/install-remaining-modules.sql` contains those seven complete migrations in one transaction for SQL Editor. Otherwise, apply only the pending versioned files. The grouped file does not update Supabase CLI migration tracking automatically.

## Optional pre-opening sample data

After founder shop setup, run `supabase/seed.sql` manually in the intended project's SQL Editor as `postgres`. Samples are stored in Supabase and appear in the normal founder pages. A first run requires an empty menu and ingredient list; reruns preserve edits, and older menu-only seeds are extended safely. Examples include pending expense/funding records, planned purchases and a disabled device, with no approved spending, confirmed funds, stock, sales or fake accounts. See [SEED_DATA.md](SEED_DATA.md) for target selection and scoped administrator cleanup. Do not include the seeder in production deployments. Configure SMTP/Storage and verify the hosted launch gates in [OPERATIONS.md](OPERATIONS.md).

## Verify a founder session

Sign in and verify shop setup, category creation, a product variant with price, an ingredient with its standardized base unit, and recipe publication. Check that the variant can be enabled only after a recipe exists. Change a price and ingredient estimate, then publish another recipe version: earlier versions must retain their saved price/cost values. These are real configuration records; no sales, stock, expenses, or funding need to be created.

Local PostgreSQL tests cover SQL execution, cross-shop reads/references, staff restrictions, direct-write denial, immutable history, audited changes, precise recipe estimates, atomic failure rollback, and invalid quantities. They use an isolated auth stub, so a hosted Supabase founder session remains a separate verification gate.
