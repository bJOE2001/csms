# Coffee POS

A small online POS with four screens: **POS**, **Menu**, **Sales** and **Expenses**. Manage products, categories, images, sizes, prices and direct costs in Menu, take cash or GCash payments, manage operating expenses in Expenses, then review date-filtered revenue, gross profit, net profit, expenses, receipts and full refunds in Sales.

Stack: Next.js 15, React 19, Tailwind 3, shadcn/ui and Supabase Auth/PostgreSQL. There is no inventory, recipe, purchasing, budgeting, funding, staff administration, device pairing, cash shift or offline checkout module.

## Run

1. Install supported Node.js 22.12+ and run `npm ci`.
2. Copy `.env.example` to `.env.local` and set your Supabase public URL/key and APP_URL.
3. Apply migrations in `supabase/migrations/` in order. On an existing project apply only unapplied migrations, including **202611020001_simple_pos.sql**, **202611020002_pos_profit.sql**, **202611020003_record_missing_cost.sql**, **202611020004_menu_management.sql** and **202611030001_expenses_management.sql** before deploying this frontend.
4. Create your owner account in Supabase Auth (disable public signup), then run `npm run dev`.
5. Sign in, create a shop if needed, and add products in Menu.

Never reset a live database to apply this update. Older migrations are retained as the database upgrade history; they are not imported by the running application. The initial simple POS migration copies current products and saved sales into `pos_products` and `pos_sales`. Old financial/history tables are retained to preserve records; no destructive hosted schema cleanup is run automatically. Back up the database before applying upgrades.

## Behavior

Checkout prices are verified server-side and saved in an atomic transaction. Receipts retain product, size, price and cost snapshots. Different sizes are separate cart lines. Menu changes never silently reprice an open cart; the cashier reviews changes or removes unavailable items. A single pending sale is saved in the browser before sending; a lost response is retried with the same ID to prevent duplicates. This is request recovery, not offline selling. Product management and refunds require owner access, checked again in SQL. Cross-shop access is checked through membership and RLS.

Old unsent sales in the retired offline till are not imported by the SQL migration. Export and reconcile any old offline sales before switching versions; their existing IndexedDB storage is not erased. The old service-worker URL remains only to retire previous registrations.

## Checks

- `npm test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:ui` (isolated shared-component, Sales and Expenses fixtures)
- `npm run test:e2e` (production Next server; POS API responses mocked)
- `python tests/database/check-simple-pos.py` (Windows PostgreSQL 17 default path, or pass its bin path). Creates a unique disposable cluster on localhost port 55439, applies all migrations, checks checkout/RLS/refunds, and stops it. Never connects to the configured Supabase project.

Hosted authentication and the deployed migration still need verification in your Supabase environment.

## CSV reports

Sales → **Export CSV** downloads a profit summary, sales history or expense history for the applied date range. It uses the same loaded data and `summarize` calculations as Sales, with no extra API or database changes. Monetary values use numeric PHP decimals; missing costs/profit are blank and marked incomplete. Unicode, quoted/multiline notes and formula-like user text are handled for spreadsheet use. Reversals and voided expenses remain visible in detailed files with their effective amounts. These exports are report snapshots, not database backups.

## Profit

Gross profit = revenue after refunds minus saved product costs. Net profit = gross profit minus recorded operating expenses. Enter a per-item cost (ingredients, packaging and other direct costs) in Menu, including each configured size. Costs are saved on checkout; later edits never rewrite receipts. Refunded prepared goods retain their costs; cancelled sales are excluded. Refunds restate the original sale's period.

Add overhead expenses such as rent, wages, utilities, payment fees and applicable taxes in **Expenses** (`/expenses`), dated to the period they belong to. Owners can add, edit and delete expenses; deletion retains a voided record. Edits keep the record ID and creation details, record before/after audit snapshots and reject stale changes. Sales retains the operating expense total and uses the same records on refresh. Do not enter ingredient purchases again as overhead when already included in product costs. Net profit is based on recorded costs, not a full accounting ledger or automatic tax calculation. See [Expenses Management](docs/EXPENSES_MANAGEMENT.md) for rollout, reporting and compatibility details.

Older sales with unknown costs show **Incomplete** profit. The owner can open an affected receipt and choose **Record missing cost**, enter the actual total preparation cost for all items and quantities, and explain its source. This one-time supplement saves the owner, timestamp and note without changing original receipt items, selling prices or payment status. Identical retries are safe; known costs cannot be overwritten. A zero cost must be entered explicitly if nothing was consumed. Setting a product cost affects future sales only; historical costs are never invented.

The additive migrations preserve existing unsized checkout payloads. Old clients omitting product metadata retain the stored fields; they cannot overwrite configured size prices. After introducing sized products, keep a size-aware POS frontend deployed: older clients cannot select sizes and the server rejects those orders. A frontend rollback retains all additive data; do not drop menu, cost, audit or expense records. See `docs/MENU_MANAGEMENT.md` for rollout and compatibility details.
