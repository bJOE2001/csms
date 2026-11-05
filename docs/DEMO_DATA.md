# Demo data: October 1–November 3, 2026

Use `supabase/seeds/demo_october_2026.sql` in **Supabase SQL Editor**, using the postgres role. Apply the existing application migrations first and create your shop through the application if it has not been set up.

The seed adds synthetic financial activity to the selected shop, so use a demo/test shop. It never deletes or overwrites existing records. Added product/category names and expense descriptions start with `[Demo]`. Existing users, shop settings, product relationships and financial history remain intact.

## Run

1. Open the SQL file and copy its complete contents into SQL Editor.
2. If your database has exactly one shop, it is selected automatically. For multiple shops, find the intended shop with `select id, name from public.shops;`, then uncomment the `set_config` line near the top of the seed and replace `YOUR-SHOP-UUID` with that ID. The seed refuses an ambiguous target.
3. Run the complete script. It runs in one transaction and returns `demo_seed_summary`, including record counts, revenue, costs, expenses and profit in PHP.
4. Refresh the application. Open Libraries for categories, Menu for products and size pricing, and POS for product browsing.
5. In Sales and Expenses, set **From Date: October 1, 2026** and **To Date: November 3, 2026**. Direct paths: `/app/sales?from=2026-10-01&to=2026-11-03` and `/expenses?from=2026-10-01&to=2026-11-03`.

The date range covers all 34 calendar days in the shop's configured timezone. Reports default to today, so selecting the full period is necessary to see the whole dataset.

## Included

- Five product categories and eleven products, including one unavailable seasonal product.
- Six drinks with custom size prices, direct costs, defaults and an unavailable size; four food/snack/dessert products use regular pricing.
- 514 daily Cash and E-wallet sales with changing quantities, multiple-item receipts, saved size labels, correct cash/change, completed sales and full-refund examples.
- 49 expenses for rent, wages, utilities, internet, cleaning, equipment maintenance, permit fees and daily transaction fees; one duplicate expense is voided to demonstrate retained history.
- Complete saved product costs so gross profit, net profit and margins can be displayed. Refunded prepared products retain costs; cancelled sales and voided expenses are excluded according to existing reporting rules.

Product pictures are not invented; the existing thumbnail fallback is used. No additional libraries, accounts, expense categories, inventory or unsupported workflows are created.

For the untouched demo cohort, revenue is **₱93,265**, product costs **₱35,598**, gross profit **₱57,667**, active expenses **₱43,855**, and net profit **₱13,812**. Existing shop records in the same period are also included by the application, so its combined totals may differ from this demo-only summary.

## Reruns and verification

IDs are deterministic UUIDs scoped to the shop and demo dataset. Rerunning the seed adds no duplicate sales or expenses and does not reset demo records that you have edited, archived, refunded or voided. A category-name collision with an independently created row causes the transaction to fail rather than replacing that row. Test IDs in different shops remain separate.

The existing catalog, checkout, refund and expense functions validate and create the records. Only newly created demo timestamps require privileged updates. The actor is the selected shop's existing active owner, configured only inside the seed transaction; authentication and permissions are not changed.

`python tests/database/check-simple-pos.py` runs the seed twice in a disposable local PostgreSQL cluster. It verifies date coverage, sale/item totals, size snapshots, payment states, reporting readers, original-record preservation, ambiguous-target rejection and rerun idempotence. It never connects to hosted Supabase.

## Remove old cancellation examples

The updated seed creates completed sales and refunds only. Removing unsubmitted cart items stays local and creates no sale. No separate cancellation action is provided. Real historical cancelled receipts remain supported and excluded from revenue/cost totals; the Refunded Transactions metric counts only full refunds.

For an existing demo shop, run `supabase/seeds/cleanup_demo_cancellations.sql` in Supabase SQL Editor as postgres. Set `coffee_pos.demo_shop_id` near its top when more than one shop exists. The script selects only the five deterministic receipt slots used for old cancellation examples and requires their original cancellation reason, payment state, date, saved request ID, demo-only item names and absence of later refund/cost annotations. Other records are retained. It returns the number removed, runs in one transaction and can be safely rerun. It never runs automatically through the application or the ordinary seeder.

Then rerun the updated `demo_october_2026.sql` if you want all 514 demo receipts: deleted example slots are recreated as supported completed transactions. Existing edited records are not reset. These scripts were tested in a disposable local PostgreSQL database; hosted cleanup requires an administrator SQL session and is not applied by the frontend change.
