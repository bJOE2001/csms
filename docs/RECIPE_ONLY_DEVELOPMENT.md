# Recipe-only inventory and guarded local development reset

## Current behavior

Inventory has exactly two primary tabs: Stock Items and History. Add Item and Stock In are the header actions. Click a stock row, or focus it and press Enter/Space, to open Item Details. Counts and increase/decrease/wastage actions retain the existing audited stock commands. The permanent setup wizard and row action dropdowns were removed.

New items optionally include Initial Stock quantity and total value. Item creation and opening stock commit in one transaction through `pos_inventory_create_item`; retries cannot create a second opening movement. Invalid opening data rolls back item creation too. Existing items cannot receive a second initial balance.

Product forms accept selling prices and metadata, never manual preparation costs. `productWriteSchema` rejects manual cost keys, including nested sizes. Existing cost columns remain for historical compatibility but are not authoritative for future selling. The server injects retained legacy values internally only to keep older product validation and active-recipe guards compatible; the inventory transaction replaces new-sale costs with actual consumption.

Apply `202611070006_recipe_only_costing.sql` after the five existing inventory migrations. This additive migration preserves historical rows and recipe versions, rejects manual product-cost writes, revokes browser access to manual receipt-cost supplements, and requires an active recipe for every new checkout line. The existing locked, atomic inventory checkout implementation remains intact. Replays of previously completed sale IDs retain their original idempotency behavior. Deactivating a recipe prevents subsequent sales; it never restores manual fallback selling. Public menu publication/availability stays independent and continues its explicit field allowlist.

Create a product, save a per-size recipe draft, review costs, then activate it. Unknown costs block activation. Explicitly recorded zero-cost stock remains valid. Selling prices remain owner-configurable.

## Explicit local reset command

For an explicitly authorized hosted development reset, use the separate [hosted reset instructions](HOSTED_DEVELOPMENT_RESET.md) and generated `hosted_development_reset.sql`. The local seed and command below remain local-only.

```powershell
python scripts/reset-development.py --confirm-local-business-reset
```

The command never reads `.env`, never accepts a remote database URL, and refuses production mode. It starts only the dedicated PostgreSQL 17 data directory at `C:\xampp\htdocs\csms\.local\logo-development`, bound to `127.0.0.1:55440`, then verifies `SHOW data_directory` before changing data. An occupied port or mismatched directory fails closed. `LOGO_POSTGRES_BIN` can specify another installed PostgreSQL binary directory.

It applies the complete migration chain, creates the local founder/shop only on first initialization, and replaces that shop's business records in one transaction. Auth identities, shop UUID, membership, roles, branding, configuration and migration history survive repeat resets. Only this guarded local superuser workflow temporarily bypasses immutable-history triggers for reset and deterministic fixture timestamps. Normal migrations, application startup and deployments never execute it.

The command stops its server after completion and prints the retained shop UUID. The cluster remains on disk for inspection. This is a dedicated PostgreSQL integration dataset, not a replacement Supabase Auth/PostgREST service. **The application's configured hosted Supabase project remains unchanged.** Therefore the existing running website will not show this dataset automatically. Loading it into a real Supabase development stack requires a separately verified disposable target and its normal Auth/PostgREST services; do not reset an unverified hosted project.

## Integrated illustrative data

`supabase/seeds/integrated_development.sql` creates nine menu products, four categories, twelve correctly classified inventory items and fourteen active size/regular recipes. Initial balances and a later stock receipt use actual stock RPCs. It creates 228 mixed Cash/E-wallet transactions across October 1 through November 7, 2026, plus one refunded finished-good sale with an explicit reusable-stock return. Prepared-drink refunds retain consumed ingredients. Wastage, four ordinary operating expenses, and an explicit spillage-loss expense equal to its recorded stock loss are recorded. The loss is charged once, outside sale consumption costs. Stock purchases are not also operating expenses.

Amounts, prices, recipes and dates are illustrative development fixtures, not verified Sip & Snap business operations. Business names contain no prohibited development labels. No external product photography or fictional shop contact details are added. Dashboard values are derived from persisted transactions, costs, expenses and return credits rather than hardcoded totals.

The reset verifies retained users/memberships, all 229 costed sales, balanced quantities/values against stock movements, active configurations, manual-cost rejection, recipe deactivation blocking checkout, and retry-safe initial stock. Run it twice to verify repeatability and stable shop identity.

The old October-only seed remains a historical development tool; it is not compatible with recipe-only selling and should not initialize this version. Use the integrated reset command instead. Existing historical test fixtures run before the intentional selling-policy upgrade; new-policy probes run against the full migration chain and integrated data.

## Validation and remaining boundaries

Focused unit/API tests and browser component fixtures cover the new write contract, empty/missing recipe behavior, initial stock payloads, keyboard row activation and the five requested responsive viewports. Local PostgreSQL tests exercise real RPCs and ledger reconciliation. Browser fixtures do not prove a hosted end-to-end reset. The existing Node 26/Undici image-upload stream rejection is reported separately from focused test results.

No hosted business data was reset, no hosted migration application status was claimed, and no unverified legacy stock item was renamed. Back up before applying the additive migration to any non-disposable database. Retain recipe-only-compatible frontend/API code after deployment; an older frontend can display stale manual fields and will receive validation errors from the new server policy.

Validation result: 116 focused unit/API tests and nine browser scenarios passed. All 136 full-suite assertions passed, but the unexcluded run still reports one pre-existing Node 26/Undici stream error. TypeScript, ESLint, production build, legacy compatibility migration gates and repeated guarded reset/integrity checks passed.
