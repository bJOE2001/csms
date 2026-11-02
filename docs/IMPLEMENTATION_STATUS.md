# Implementation status

Updated: 2026-10-29

## Implemented MVP modules

- Dashboard: pre-opening/operating state, planned budget versus approved actual spending, funding, setup progress, pending payments and unresolved shifts.
- Products/recipes: category/product editing, recipe-backed variants/add-ons, availability, immutable price/recipe versions and exact estimated costs.
- Inventory: append-only opening/receiving/consumption/waste/count/return movements, full-count revaluation, low stock, moving weighted average, unknown valuation and audited recovery deficits.
- Suppliers/purchases: contact editing, multiple planned lines, order/cancel transitions, atomic partial receiving, cumulative fractional-centavo valuation and duplicate protection.
- Finance: classified startup budgets, capital/loan/reimbursable funding with all-history per-founder totals, actual expenses, pending/approved/rejected/reversed decisions, supporting documents and independent founder approval for multi-founder shops. Financial details remain immutable.
- Cashier shifts: assigned-device opening, signed cash requests/decisions, expected/count/discrepancy, sequence-watermark closure, explicit exception closure and audited reconciliation review.
- POS/payments: search/category/cart/add-ons, dine-in/takeout, founder discount policy, cash/wallet methods, tender/change and independent wallet confirmation.
- Orders/receipts: saved price/recipe snapshots, history/printing, serialized whole-order refunds/cancellations, current-shift cash refunds and separately authorized usable-stock returns.
- Offline synchronization: static public POS shell, paired single offline-capable browser, expiring server-issued menu/session, scoped Dexie queue, durable local commits, retry diagnostics, original-ID idempotency, menu rollover and recovery JSON export/import.
- Reporting/audit: shop-timezone date ranges, gross/discount/refund/net/COGS/profit, missing-cost labels, product cost allocation, payment-event reconciliation, stock/cash review, CSV formula escaping and append-only audit viewer.
- Staff/settings: account membership administration, expiring/revocable verified-email invitations, last-founder protection, devices, receipt/profile/hours/payment/discount/offline policies.
- Account recovery/documents: Supabase recovery/callback/password update, optional server-only invitation email, private receipt bucket policies and signed downloads.
- Seeder: original menu samples plus suppliers/plans/budgets/pending finance/disabled device, safe upgrade of an earlier menu-only seed, exact-ID manifests, idempotent reruns and scoped administrator cleanup.
- Recovery tooling: real isolated database dump/restore drill and documented queue, lost-device and hosted backup/Storage restoration procedures.

## Verification evidence

- Lint, type checking, production build and 38 unit tests passed after the UI/navigation and runtime configuration updates.
- All ten PostgreSQL migrations applied successfully. SQL fixtures verify identity/menu isolation, immutable history, stock/planning/receipt semantics, fractional rounding, physical revaluation, deficit receipts, atomic/idempotent checkout, post-close receipt retries, refunds/returns, expected cash, financial reports, payment confirmation dates, dual-founder decisions, verified-email invitations and staff/last-founder restrictions.
- The extended seeder, repeated execution and exact scoped cleanup passed, including refusal of genuine dependencies and atomic rollback of injected failures.
- A real custom-format dump/restore drill retained business row counts, RLS policies and history triggers.
- Nine public/POS production-browser checks passed, including offline refresh with the active theme retained, a simulated committed-but-lost response retried as one order, queue export/import followed by the next sequence, and worker-cache upgrade preserving pending POS storage. The offline message assertion was updated to the new plain-language copy; the focused retry passed without further application changes.
- Four authenticated production-browser/database tests passed using a test-only Auth/REST contract adapter over disposable real PostgreSQL: all workspace pages, persisted supplier creation, dashboard/POS module loading, page search and keyboard closing, responsive layouts at 320/768/1024/1440 px, mobile navigation, menu/device/shift setup, two real checkouts, selected-receipt printing, operating dashboard and shift closure. Desktop and mobile screenshots were inspected. This never changes `.env.local` or uses the hosted project.
- Three independent built-in transaction review cycles were reconciled; see `REVIEW_NOTES.md`.
- No dependencies were added; the prior complete dependency audit reported zero vulnerabilities.

## UI clarity and runtime update

The workspace now has grouped desktop navigation, a mobile menu, Ctrl/Command+K task search, contextual next steps, workflow guides and page actions. Inventory uses a compact stock table and separate count/opening/wastage disclosures. Typography, spacing, forms and public/auth/POS styling share the existing coffee-shop palette. Staff navigation and search remain restricted to their permitted pages.

The worker retires the v2 application cache and caches content-versioned production assets, leaving mutable development chunks on the network. Development and production use separate generated output folders. Desktop/mobile navigation render independent node trees during server-action refresh. Optional paired server runtime Supabase variables keep isolated test sessions stable through development recompilation; the existing public environment pair remains the default. `.env.local`, hosted business records and database migrations are unchanged by the redesign.

Focused development checks verified dashboard/POS transitions and keyboard/mobile discovery. Development checks explicitly budget for cold compilation and warm their target route; production interaction deadlines remain unchanged. See `UI_GUIDE.md` for the navigation/workflow map.

## Hosted and production gates

No hosted migrations, seed or cleanup have been executed by this chat. `.env.local` provides public application access, not administrator database access. Apply pending migrations 004–010 after the existing 001–003, then run the seeder in the intended preparation project. Do not rerun already applied migrations.

Hosted Supabase Auth, SMTP delivery/invitation templates, private Storage uploads/downloads, production backups/Storage restoration and physical POS hardware still require environment verification. The local Auth stub/contract adapter does not establish those hosted properties. At the prior read-only check, public signup was enabled; disable it for internal founder/staff access.

Module implementation and deployment verification are separate. Do not claim production readiness until external gates are tested. See `OPERATIONS.md`, `SUPABASE_SETUP.md` and `SEED_DATA.md`.

## Explicit MVP boundaries

The user selected moving weighted average. Add-ons are explicit recipe-backed cart lines. Reversals cover whole orders and optional whole-consumption stock returns. Product COGS is labelled a gross-share allocation; operating profit remains an estimate. Expenses are reported by incurred date using their current reviewed state; audited reversals can restate those periods. Funding never implies legal ownership or profit sharing.

Unexported unsynchronized records cannot survive total device/browser-storage loss. Founder recovery is audited and unresolved cash/stock stays visible. Default samples create no actual sales, received/opening stock, confirmed funds or open shifts.
