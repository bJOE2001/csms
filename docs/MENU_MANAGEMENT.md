# Menu Management

Navigation is **POS → Menu → Sales → Expenses → Libraries**. Menu uses the same shop membership and catalog as POS. Owners add, edit and delete; members can view the menu and sell.

## Maintain the menu

- Add a category in **Libraries → Product Categories**, or leave products uncategorized. Categories can be renamed. Reassign all unarchived products before deleting an assigned category.
- Add product requires a name, PHP selling price and direct cost. Description, category and product image are optional. Upload Image supports JPG, PNG and WebP files up to 5 MB with a local preview; Image URL preserves HTTPS/local-path compatibility. Failed images show the neutral fallback. Apply the [product-image Storage setup](PRODUCT_IMAGES.md) before using device uploads.
- With no sizes, the regular price and cost apply. Add one or more sizes to use custom labels, individual prices/costs, and individual availability. Select exactly one default. Up to 20 sizes are supported. Labels are unique after trimming and case normalization. Price/cost inputs accept nonnegative amounts with up to two decimals, including explicit zero.
- Removing a size changes only future orders. Removing the default chooses the first remaining size in the draft. Removing every size returns to regular pricing. Save applies the draft; closing a modified form asks before discarding it.
- Delete product requires confirmation and archives its record. It disappears from the active catalog without deleting receipts. Historical migrated product names are left intact; no categories or sizes are guessed from those names.

## Sell and review changes

POS provides search, category filters, available size selection, cart and payment only. The default available size is preselected; unavailable sizes cannot be added. Identical product/size selections merge; different sizes remain separate lines. Unit prices and labels are captured when added to the cart.

Menu changes refresh other tabs via browser storage events and refresh on focus. Refresh also fetches changes from another browser/device. A changed cart price or size label stays visible at its original value and blocks checkout until the cashier accepts the current option. Disabled, archived or removed selections must be removed. SQL verifies availability and prices again at checkout, including changes that happened after the last refresh.

New sales snapshot product name, size ID/label, unit selling price, quantity, line total and direct cost. Receipt display, printing and CSV use those snapshots. Profit continues to use saved costs, with the selected size's cost. Editing or archiving the menu never rewrites completed sales. Lost-response retries keep the same sale ID and request; an already-saved receipt is returned even after menu changes.

## Deploy and compatibility

1. Apply earlier unapplied migrations in order. For an installation already on the simple POS/profit/cost-recording version, the new migration is `supabase/migrations/202611020004_menu_management.sql`.
2. Apply that additive migration **before** deploying this frontend. It adds `pos_categories` and nullable/defaulted fields to `pos_products`, and replaces only the catalog-save and checkout SQL functions. It does not alter past sale data, authentication, refunds or expense calculations.
3. Deploy the frontend and check an owner and member account in the hosted environment. New Menu/POS GET responses require the new fields/table; an unapplied migration produces an explicit loading error.

The existing `/api/pos` path and action envelope are retained. Product save accepts optional category/description/image/sizes; omitted metadata is preserved for old clients. Checkout accepts optional `size_id`/`size_label`; unsized products and existing pending requests continue to work. Once sizes are configured, older frontends cannot select them: the server rejects a missing size rather than charging a misleading regular price. Retain a size-aware POS frontend for those products.

Rollback does not drop columns, categories, size configurations, archived records or snapshots. A previous frontend remains usable for unsized products; sized products require the new client or deliberate owner reconfiguration. No destructive schema rollback is included. The migration is verified with all historical migrations in a disposable local PostgreSQL cluster; hosted Supabase changes are not applied by the test runner.

## Verification

`npm test` exercises menu schemas, exact-money inputs, availability, cart merging and review. `npm run test:e2e` runs the actual Next application with mocked API responses for Menu CRUD, size defaults/validation, category protection, cart prices, refresh and responsive layout. `npm run test:ui` covers shared dialogs, Sales, printing and CSV. `python tests/database/check-simple-pos.py` applies every migration in a disposable local PostgreSQL cluster and checks server validation, permissions, historical snapshots, retry behavior, selected-size costs and category safeguards. It never connects to hosted Supabase.
