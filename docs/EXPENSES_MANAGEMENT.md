# Expenses Management

`/expenses` is the authenticated workspace for operating expense management. The sidebar exposes POS, Menu, Sales and Expenses. Members can read expense reports; only active shop founders can mutate records, enforced again by PostgreSQL. Sales has no embedded expense forms or management table.

## Data and reporting

Both pages read `public.pos_expenses(uuid,date,date)` and use the existing `public.pos_expenses` table. There is no data copy, replacement table or new expense model. Records support a date, description and amount in integer PHP cents. Categories and notes are not supported by this model and are not fabricated in the interface.

Both modules reuse the same date controls and `shopDate`/`salesRange` helpers. Valid dates apply automatically after a brief pause, without shortcuts or an Apply Dates button. Incomplete or invalid edits leave the current report visible. The default is the shop's current date (Asia/Manila for the existing configuration); query dates are inclusive. Client validation matches the existing SQL rejection of reversed ranges and ranges longer than 366 days. Search filters descriptions, dates and statuses within the loaded period; it does not change the overview totals.

Total, largest and average expenses exclude voided records. The record count includes retained voided entries; the page states how many are voided. Averages round to integer cents, matching the existing reporting convention. Empty active sets show zero. Sales' `summarize` implementation, refund cost treatment, payment breakdown and CSV calculations are unchanged. The Sales expense metric links to Expenses with the selected dates.

## Mutations

All writes use the existing same-origin, authenticated `/api/pos` endpoint:

| Action | Database command | Behavior |
| --- | --- | --- |
| `expense` | `pos_add_expense` | Existing idempotent create; unchanged request contract. |
| `update_expense` | `pos_update_expense` | New owner-only edit with `operation_id` and `expected` original date, description and cents. |
| `void_expense` | `pos_void_expense` | Existing soft deletion; unchanged request contract. |

Edits lock the existing row, reject voided or stale records, and use the existing `business_operations` ledger. Identical retries return the original result without repeating an edit, including after a later edit. A changed payload with a reused operation ID is rejected. The existing immutable `audit_logs` table receives the complete before/after snapshots and actor. No new table or column is required.

Delete confirmation identifies the description and amount and explains that history is retained. Voided records stay visible and remain excluded from Sales profit. Errors retain form drafts, and pending submissions prevent duplicate clicks. Successful mutations refresh the current page and revalidate `/expenses` and `/app/sales`; Sales reflects the same data on navigation or refresh.

## Deployment and rollback

1. Apply `supabase/migrations/202611030001_expenses_management.sql` after the existing migrations, before deploying the frontend. It adds only an RPC and its grants; it does not modify existing expense rows or financial calculations.
2. Deploy the new frontend and verify owner and staff access against the hosted Supabase environment.
3. Existing clients may continue calling `expense`, `void_expense` and `pos_expenses` with their original payloads throughout rollout.

For a frontend rollback, retain all expense, audit and operation records. The previous frontend reads the same table and continues to support create/void. If removing the edit command, first roll back the frontend, then remove only `public.pos_update_expense(uuid,jsonb)`; do not drop or reset financial tables. The database integration suite checks this compatibility in a rolled-back local transaction.

## Validation

`python tests/database/check-simple-pos.py` creates a disposable local PostgreSQL cluster, applies every migration and verifies existing checkout/reporting behavior plus expense edit authorization, date movement, audit snapshots, retries, conflicts and retained deletion. It never connects to hosted Supabase.

`npm test` covers request validation/revalidation and agreement between Sales and Expenses totals. Browser fixtures exercise create/edit/delete, failed retries, filtering, validation, responsive layouts and Sales profit updates from one shared fixture data source. Hosted authentication and migration deployment require environment-specific verification; fixture tests do not claim to exercise a hosted database.
