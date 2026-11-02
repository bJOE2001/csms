# Operation, recovery, and deployment

## Preparation and daily workflow

Apply every pending migration in filename order. Configure a real founder shop, products, prices and recipes, then review and enable sellable variants. Add actual opening stock or receive actual ordered purchases; plans never add recorded stock. Inventory uses moving weighted average. Partial receipt valuations allocate the cumulative line value, and consumption allocates the remaining centavos on depletion. Unknown opening values remain unavailable until known stock is depleted or a documented full physical count establishes a valuation. A full zero count must have zero value.

Register a POS device in Settings. Only one enabled device may be designated offline-capable. Before opening its first shift, a founder visits `/pos` on that browser and pairs it. Pairing stores a revocable random browser registration locally and only its hash in PostgreSQL. A shift must be closed before replacing its paired browser. Staff can use the paired device with their own assigned shift.

Open a cashier shift with physically counted opening cash, connect it from POS, and save the menu snapshot. Prices and recipe IDs are bound to the server-issued session; arbitrary historical versions are rejected. New offline checkout is permitted only on the designated device and within the configured 1–24 hour authorization (12 hours by default). Online-only devices stop new checkout when connectivity is unavailable. Use **Refresh menu after sync** to rotate an authorization and obtain current prices/recipes after every local order is server-confirmed.

Add-ons are separately priced, recipe-backed menu variants, added as explicit cart lines. Create an Add-ons category for options such as extra espresso, milk upgrades, or packaging. This keeps prices and stock consumption explicit in receipts.

## Checkout and synchronization

Checkout commits an order ID, immutable payload and monotonically increasing session sequence to IndexedDB before showing local success or clearing the cart. Local success is labelled pending. Refresh does not discard committed queue entries. Only a successful server receipt changes an entry to synced. The server validates membership, session, shift, menu, payment, discount and stock and writes every transaction effect atomically. Repeated IDs with identical payload return the saved result, including after shift closure or lease expiry; conflicting payloads fail.

Cash tender must cover the amount due; change is separate from cash received. Wallet selections remain pending until a founder independently verifies funds. A multi-founder business requires a different founder to approve expense, funding or cash requests created by another decision maker; a single-founder business can approve its own records. Staff cannot view ingredient costs, expenses, funding or profit data.

The queue records failed attempts and error messages. Retry the original order without changing its identifier or payload. If stock changed, authorization expired, or a device was replaced, a founder must review the real transaction and use **reconcile real offline sale** with an explanation. This preserves the original order ID and payload hash, audits the exception, and permits an explicit negative recorded stock deficit with unavailable value. Positive receipts can reduce the deficit; a physical count resolves it. A late recovered sale on a closed shift flags cash reconciliation unresolved rather than silently rewriting the old count.

## Shift closure and reversals

Normal closure requires every local sequence acknowledged, no pending payments/cash decisions, and an actual closing cash count. Browser tabs share IndexedDB transactions and Web Locks; server checkout, receiving and closure serialize per shop. The sequence watermark cannot prove the absence of an order lost before any durable local commit. A founder exception closure explicitly marks a lost-device or otherwise unresolved shift for review.

Refund/cancel actions preserve the original sale and append a reversal event. Revenue reversal and confirmed-funds refunds are distinct; a pending wallet balance creates no fictitious cash refund. Any physical cash refund is charged to the current assigned open shift, preserving the original finalized shift. Stock is returned only by a separate founder action asserting that all consumed ingredients are physically usable and returned. Prepared/wasted drinks normally remain consumed. Whole-order reversals and whole-consumption returns are supported; partial line refunds are outside this MVP workflow.

After recovering a closed shift, resolve its pending payments/requests and use **Review recovered shift**. The physical cash count stays unchanged, expected cash is recalculated, and the previous result is retained in audit history. Any discrepancy remains visible.

## Reports and classifications

Reports use the shop timezone and explicit date ranges. Net sales = gross − discounts − revenue reversals in the period. COGS uses actual stock consumption less explicitly returned cost. Missing costs prevent a claimed gross/operating profit. Product COGS is labelled an allocation by gross order-line share. Operating profit is always an estimate and excludes equipment, inventory assets and founder funding. Approved expenses are shown by incurred date using their current reviewed state; reversals therefore restate the affected incurred-date report, with the original record and decision retained in audit.

Recorded inventory wastage is deducted separately from operating profit at its ledger cost; an unknown wastage value prevents that profit estimate. Do not enter a second manual operating expense for the same inventory loss. Physical-count valuation corrections remain separately visible for accounting review. Order-date sales by method are separate from confirmation/refund cash flows.

Payment reconciliation groups confirmations by `confirmed_at` and confirmed-funds refunds by reversal-event time. Outstanding pending balances are shown separately. Unconfirmed wallet payments, unresolved shifts, inventory exceptions, missing valuation, and local unsynchronized orders remain visible limitations. CSV exports escape spreadsheet formulas in untrusted text.

## Device recovery

Export the pending recovery JSON before replacing/revoking a device or clearing browser data. Retain the file privately; it contains business order data, not login credentials. A signed-in founder in the same shop can import another cashier's export and reconcile original payloads. Conflicting identifiers are rejected. Do not create new IDs just to retry an uncertain transaction: the original ID lets the server return a receipt committed before a lost response.

If the device and all exports are lost, unsynchronized orders cannot be reconstructed from the server. Preserve receipts/payment references, perform a physical count, and have a founder reconcile financial/inventory differences with explicit audit reasons. No software can restore browser records that were never synchronized or backed up.

## Authentication and documents

Set `APP_URL` to the deployment's HTTPS origin and add its callback URLs in Supabase Auth. Disable public signup. Recovery uses the supported Supabase PKCE exchange and an authenticated password update. Configure project SMTP and test actual delivery before inviting staff. Optional `SUPABASE_SERVICE_ROLE_KEY` is used only inside the invitation server action; never add a `NEXT_PUBLIC_` prefix. Without it, create Auth accounts through Supabase and share the generated private acceptance link with the existing verified recipient. Invitations expire after seven days, match the verified email, and can be revoked. The final active founder cannot be removed.

For new-account invitation emails, configure the invite template to point to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite`; the redirect supplied by the app already includes the membership invitation identifier. Recovery uses the usual Supabase PKCE redirect (`/auth/callback?next=/reset-password`); token-hash recovery callbacks are also supported. These flows must be tested with the hosted email configuration.

Supporting PDF/JPEG/PNG files up to 10 MB are stored in the private `business-documents` bucket. SQL policies restrict uploads and reads to active founders of the path's shop. Downloads use short-lived signed URLs. Storage object bytes require a separate backup from the PostgreSQL metadata.

## Backup and restore

`scripts/test-database.ps1 -PgBin 'C:\path\to\PostgreSQL\bin'` performs a real custom-format `pg_dump` and `pg_restore` drill into another disposable local database. It verifies retained audit/product counts, RLS policies and triggers, then drops both temporary databases and stops its owned cluster. This does not verify hosted Supabase backups, Auth delivery, Storage objects or device hardware.

Before production use, enable the project's appropriate database backup/PITR service, retain a schema/migration history, back up private Storage objects separately, and restore into an isolated Supabase project. Verify founder/staff access, sample sale/receiving/retry/refund reports and Storage permissions there before accepting the restore. Record recovery time and the tested backup timestamp. Never use destructive database-reset commands against the live shop as a sample-data cleanup method.

The default seed adds preparation examples only. It creates no sales, stock, actual receipts or confirmed payments/funding. Remove samples before real setup using the scoped reset, or initialize a separate clean production project. Once sample financial records have been approved/received or referenced by real activity, scoped cleanup refuses; use a fresh project deliberately.
