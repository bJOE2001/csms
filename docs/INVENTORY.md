> Current policy: manual fallback selling and the setup wizard are retired. See [Recipe-only inventory and local reset](RECIPE_ONLY_DEVELOPMENT.md). Earlier rollout descriptions below document the preceding compatibility phase.

# LOGO Inventory: implementation and owner setup

## Architecture

The application uses Next.js App Router, Supabase authentication and guarded PostgreSQL RPCs. Inventory reuses `ingredients`, `inventory_balances`, `stock_movements`, `business_operations` and `audit_logs`. Current menu products use stable JSON size IDs. No duplicate product, sale or inventory dataset was introduced.

The five additive inventory migrations are:

- `202611070001_inventory_foundation.sql`
- `202611070002_inventory_recipes.sql`
- `202611070003_inventory_checkout.sql`
- `202611070004_inventory_accounting.sql`
- `202611070005_inventory_onboarding_refinements.sql`

They add immutable stock documents, balance revisions, versioned recipes/configurations, consumption snapshots, explicit returns, expense classification, movement/unit-lock metadata, founder-only active recipe cost breakdowns in Menu Management, and audited item classification/rename safeguards. Historical records and earlier migrations remain intact.

## Owner workflow

1. Open **Inventory** → **Stock Items**. Click **Add Inventory Item** to add actual ingredients (`Ingredient`), cups/lids/stickers (`Packaging / Supply`), and ready-to-sell items (`Finished Good`). Track pre-ground coffee in grams (`g`), liquids in milliliters (`mL`), and countable items in pieces (`pcs`). No inventory items or stock balances are created automatically.
2. Open an item's **Stock actions** menu:
   - **Set Opening Stock** records quantities and total value already owned when starting tracking (available once before any movement exists).
   - **Receive Stock** records new supplier deliveries and updates weighted-average unit cost. Kilograms convert to grams (`1 kg = 1,000 g`) and liters convert to milliliters (`1 L = 1,000 mL`).
3. Review the posting summary (item, quantity received, base-unit conversion, total purchase cost, calculated unit cost, and updated stock quantity) and confirm. Enter `0` only for genuinely free stock; unrecorded costs remain marked incomplete.
4. Open **Menu Management** and click **Manage Recipe** on a product. Select the product size, choose `Recipe-based preparation` or `Finished-good tracking`, and add required inventory items in their base units.
5. Click **Save draft** to review the server-calculated **Cost Breakdown** table (per-item cost, total preparation cost, selling price, estimated gross profit before operating expenses, and cost completeness status). Saving a draft never deducts stock or replaces an active version.
6. Click **Activate saved draft** and confirm to enable automatic stock deductions and authoritative recipe preparation costs for future sales. Products without active recipes continue selling normally with their **Manual Estimated Cost (PHP)**.
7. Complete Cash or E-wallet sales through **POS**. Required stock is deducted atomically and recorded as immutable sale consumption snapshots.

## Navigation and daily operations

Inventory exposes three primary sections:

- **Stock Items**: Current on-hand quantities, formatted average unit costs, stock values, semantic stock statuses (`In Stock`, `Low Stock`, `Out of Stock`, `Inactive`), type/status filters, and contextual item actions (`Edit Item`, `Set Opening Stock`, `Receive Stock`, `Count Stock`, `Adjust Stock`, `View History`).
- **Receive Stock**: Dedicated receiving toolbar, date filter, purchase summary metrics, and receiving history with supplier, reference, unit conversion, purchase cost, and resulting balance.
- **Inventory History**: Full movement log (`Opening Stock`, `Stock Received`, `Sale Consumption`, `Wastage`, `Stock Count Correction`, `Stock Adjustment`, `Finished-Good Return`) with date range, item, movement-type, and text search filters, plus **Return Finished Goods**.

The **Inventory Setup** guide tracks dynamic 5-step progress (`Not Started`, `In Progress`, `Ready for Review`, `Completed`), can be collapsed or dismissed, and can be reopened anytime from the header alongside **Inventory Help**.

## Legacy item verification

If an existing shop contains historical `ingredients` records (for example `Butter Croissant`, `Cold Cup - 16 oz`, `Cup Lid`, `Chocolate Sauce`, or `Espresso Beans`), verify each record with the owner before editing:

- Reclassify packaging (`Cold Cup - 16 oz`, `Cup Lid`) to `Packaging / Supply` and ready-to-sell pastries (`Butter Croissant`) to `Finished Good` via **Edit Item**.
- Rename `Espresso Beans` to `Ground Coffee` via **Edit Item** only after confirming with the owner that the record represents LOGO's purchased pre-ground coffee in grams.
- Deactivate unused legacy items rather than deleting historical records. Every item update records a `before` snapshot in `audit_logs`.

## Security, seeds and validation

Inventory pages, APIs and management RPCs require an active founder. Staff receive POS availability without purchase costs, recipe components, or draft flags. Public menu readers expose zero inventory, recipe, or cost fields.

`supabase/seeds/demo_october_2026.sql` is strictly opt-in (`coffee_pos.allow_sample_data = 'on'`), contains zero `"DEMO"` labels in seeded categories, products, descriptions, sales, or expenses, and creates zero inventory items, stock balances, purchase documents, or active recipes.

`python tests/database/check-simple-pos.py` validates the complete migration chain, inventory/checkout/accounting RPCs, concurrency races, and seed invariants in a disposable local PostgreSQL 17 cluster without touching hosted Supabase.
