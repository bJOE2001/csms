# Offline POS and installation

The POS can be installed as a PWA and take **cash sales offline** after an authenticated online visit. It queues receipts on that device and automatically uploads them to the same production origin when the POS is open and connectivity returns. The queue also survives closing and reopening the browser.

## Rollout

Apply all existing migrations, then `supabase/migrations/202611130001_offline_sale_time.sql` **before deploying this frontend**. This adds the original sale time and a separate server acceptance audit time while preserving old checkout payloads. It does not reset business data. Deploy a production build over HTTPS; localhost is supported for development checks. Service-worker installation is disabled in `next dev`.

The manifest opens `/pos` in standalone mode. On a cashier's own device, sign in and open POS online. Wait for **Ready for offline use**, which means the public POS document and its JavaScript, styles, font and brand assets are cached. The catalog must also load successfully with device storage available. Install through the browser's install/Add to Home Screen action. An offline first visit or a new login while offline is unsupported.

There is no timed waiting period. In `npm run dev`, the POS shows **Offline reopening is disabled in development**; waiting will not install it. For local offline testing, run `npm run build` and `npm run start`, then sign in and open `/pos`. Production preparation normally completes in seconds, depending on the connection. If it has not confirmed readiness after 30 seconds, the status reports that setup could not finish; keep the connection available and reload to retry. Insecure connections and unsupported browsers show their own status instead of an indefinite preparation message.

## Cashier workflow

- During an outage, **Offline · Cash sales saved on this device** appears. Use cash and wait for **Sale saved offline** before starting the next sale. The confirmation includes a stable receipt reference.
- E-wallet checkout requires connectivity and independent confirmation that payment arrived. This app does not authorize or verify e-wallet transfers offline.
- Leave or reopen POS when the connection returns. It verifies the signed-in cashier and shop, then sends queued receipts in order. It checks again on reconnect, focus and every 30 seconds while visible. **Sync now** retries immediately. Background syncing while the app is closed is not guaranteed or required.
- A lost response retries the original receipt ID and exact payload. Database transaction locks prevent a second sale or second stock deduction, including concurrent tabs.
- **Sales needing review** retains rejected receipts and the production error. **Export unsynced sales** downloads their original JSON without removing anything. Ask the owner to resolve price, stock or access problems before retrying. The app never changes an already paid offline receipt to today's prices or silently discards it.
- Signing out revokes offline access but preserves unsynced receipts. Only an online verification of the original cashier/shop reactivates that queue. Other accounts cannot see or submit it. An open cart and interrupted online checkout do not move to another account.

Keep browser site data until all receipts sync. Use a dedicated cashier device/browser profile, allow site storage, and export unsynced receipts if a device needs servicing. The app requests persistent storage where available, but clearing site data, private browsing, device loss or browser storage eviction can remove unsynced records. An installation is not a separate backup.

## Production validation and reporting

Offline stock is an estimate from the saved catalog. This device reserves queued quantities per product/size. Shared ingredients, other devices, receipts and recipe edits cannot be synchronized during an outage. Production still enforces current prices, sizes, active recipes and stock atomically; conflicts remain queued for owner review. It uses the active recipe and cost at acceptance time. Editing inventory and menu, refunds, expenses and production reports require a connection.

`captured_at` is set once on checkout creation. The new RPC records it as the receipt/report `created_at`, and records the actual acceptance time in `received_at`. Inventory movements retain posting time. New receipts must be within the last 30 days and no more than five minutes ahead of production's clock; incorrect device clocks or older receipts need review. Already accepted UUID retries remain valid after that window. Existing online pending receipts without a capture timestamp retain their original compatibility behavior.

The old single interrupted online checkout remains in its existing scoped localStorage slot until confirmation. Offline cash receipts use the new `sip-snap-pos-offline-v1` IndexedDB database. Data and caches from the retired till are preserved and are not imported automatically. The worker caches only the public POS shell and explicit public assets; it does not cache API, authentication, report pages or Next navigation payloads. Old complete shell generations are retained to keep already-open tabs working after a deployment.

## Verification

Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npx playwright test tests/e2e/offline-pos.spec.ts tests/e2e/pos.spec.ts`. Offline browser tests use real service-worker caching and IndexedDB with mocked production API responses. `python tests/database/check-simple-pos.py` uses a disposable local PostgreSQL cluster to verify actual checkout, authorization, stock, receipt dates and retry behavior. These checks do not deploy migrations or modify production.

After deployment, verify authenticated checkout, offline reload, reconnect and the resulting receipt/report date against the hosted Supabase project before using an offline till for live payments.
