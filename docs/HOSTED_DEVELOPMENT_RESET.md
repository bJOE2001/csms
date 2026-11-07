# Hosted Supabase development reset

This is an explicitly destructive **business-data reset for one development shop**. It replaces that shop's products, categories, inventory, recipes, sales, expenses and related operational history with illustrative records. Do not use it for a live shop whose transaction history must be retained.

Auth accounts, passwords, shop identity, memberships, roles, business settings, devices, invitations, migration history and other shops are retained. Product image files in Storage are not deleted. Existing public-menu publication settings remain unchanged.

## Run in Supabase SQL Editor

1. Verify the selected development project. The currently configured application uses `xygyuaszjqpyeaqrqhxd.supabase.co`.
2. Ensure the application's migrations through `202611070006_recipe_only_costing.sql` have been applied, in order. Apply only missing migrations. The reset does not install or replace the schema.
3. Open **`supabase/seeds/hosted_development_reset.sql`**, copy the entire file into SQL Editor, then run it using the database-owner role. Do not run the header/footer fragments separately.
4. If the project contains multiple shops, put the exact intended shop UUID into `logo.hosted_target_shop` near the top of the script. A blank value is accepted only when exactly one shop exists. An existing active founder is required; no login accounts are created.
5. After success, refresh the application. Select October 1 through November 7, 2026 on Dashboard, Sales and Expenses to view the full dataset.

The script contains an explicit reset confirmation string. Running the complete script replaces business records immediately; there is no additional application confirmation dialog. Pause cashier activity during this development reset. Lock acquisition times out instead of waiting indefinitely.

## Dataset

Expected result:

| Dataset | Records |
| --- | ---: |
| Menu products | 9 |
| Product categories | 4 |
| Stock items | 12 |
| Active product/size recipes | 14 |
| Sales, October 1–November 7, 2026 | 229 |
| Operating expenses | 5 |

Includes drinks with 12 oz/16 oz prices, food without sizes, ingredients, packaging, finished goods, opening stock, a stock delivery, wastage, Cash/E-wallet payments, prepared-drink refunds and an explicit reusable finished-good return. Checkout, recipes, costs and stock movements use the existing RPC implementations. Ledger quantities/values and sale consumption costs are reconciled before commit. No cancellation records are inserted.

These are dummy operations, prices and recipes, not actual business activity. Product photography is left empty rather than adding unrelated assets. Dashboard figures derive from the persisted transactions, expenses and stock costs. The legacy database identifier `gcash` is preserved for E-wallet compatibility.

## Backup and failure behavior

Before replacement, the script retains the target shop's existing business rows as JSON in **`logo_dev_reset.backups`**. The result includes the backup UUID. This private schema is denied to `anon` and `authenticated`; do not expose it through public API configuration. No Auth credentials are copied into this backup.

The backup is a record snapshot, not an automatic restore mechanism. Restoring it requires an administrator to restore related tables in dependency order while respecting history guards. Take a normal database backup separately when the existing data matters.

The whole reset is transactional. Missing migrations, an ambiguous shop, invalid stock/checkout data, changed protected records, or other errors roll back the reset. Foreign keys remain enabled. Application history triggers are suspended only for cleanup and fixture timestamps, and their original enabled/disabled states are restored before commit. The script never changes `session_replication_role`.

Reruns replace the same shop's fixture rows using shop-scoped deterministic IDs; they do not append duplicate sales. Each successful run keeps a separate backup of the preceding business state.

## Maintaining and testing

The SQL Editor artifact shares fixture definitions with the guarded local seed. Rebuild after changing those definitions:

```powershell
python scripts/build-hosted-seed.py
python tests/database/check-hosted-reset.py
```

The test starts a disposable local PostgreSQL 17 cluster on `127.0.0.1:55441`, applies all migrations, executes the hosted artifact as a non-superuser table-owner member, and stops the cluster afterward. It checks foreign-key cleanup ordering, repeat runs in one connection, private backups, account preservation, ambiguous-shop rejection, other-shop preservation, and rollback after a deliberately injected late failure. It never reads `.env` or connects to hosted Supabase.

The existing `integrated_development.sql` remains local-only. Its earlier SQL Editor error was intentional. Use the separate `hosted_development_reset.sql` artifact for the hosted development workflow.
