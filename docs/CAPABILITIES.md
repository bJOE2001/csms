# Remaining MVP capability map

Baseline: `PRD.md`; authorized by the user's request to finish every module and then update the Supabase seeder.

| Module | Responsibility | Dependencies |
| --- | --- | --- |
| inventory-purchasing | Suppliers, planned orders, partial receiving, weighted-average stock ledger, physical counts, wastage | Existing identity/menu |
| finance-shifts | Budgets, founder funding, classified expenses, approvals, cashier opening/closing and movements | Identity |
| pos-orders | Dine-in/takeout, add-ons as sellable recipe variants, discounts, manual payments, receipts, corrections | Inventory, shifts |
| offline-sync | Designated device, menu snapshot, durable queue, idempotent synchronization, export/recovery | POS |
| reporting | Pre-opening/operating dashboard, sales/COGS/expense/funding/stock/shift reports, CSV, audit | All operational ledgers |
| access-settings | Membership administration, recovery, device and receipt/business policies, private attachments | Identity |
| seed-launch | All preparation samples, optional operational test fixtures, scoped cleanup, restore/recovery drill | All modules |

Build in the order above, with database invariants tested before exposing each workflow. The approved costing policy is **moving weighted average**. Existing SQL migrations remain unchanged. No hosted migrations, seed, deployment, email, or financial activity is executed without available configured access and relevant authorization.

Completion requires working UI, server/database authorization, transaction and retry tests, accurate labels/empty states, build/type/lint checks, and browser checks. Hosted email delivery, backup service configuration, hardware performance, and production restore remain deployment verification gates when external access is unavailable; local implementations and isolated restore drills must still be completed.
