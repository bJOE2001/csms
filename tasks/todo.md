# Full MVP completion

Each task uses `docs/PRD.md` and `docs/CAPABILITIES.md`. Existing dependencies and monetary conventions are retained.

- [x] Inventory/purchasing SQL: supplier CRUD, planned lines, partial receipt, duplicate-operation protection, append-only stock, count/waste corrections and weighted average. Verify SQL fixture with retries, overreceiving, insufficient stock, cross-shop/staff denial and rounding.
- [x] Inventory/purchasing UI and private attachment metadata. Verify authenticated flows, empty/error states and responsive forms.
- [x] Finance/shifts SQL: budget versus actual classification, confirmed/pending funding, immutable expenses/approval decisions, assigned shifts, signed cash movements and final reconciliation. Verify known totals, last-founder restrictions, approval separation and closed-shift writes.
- [x] Finance/shifts UI. Verify forms and real database summaries.
- [x] POS SQL: idempotent checkout, price/recipe snapshots, aggregated ingredient consumption, manual payment confirmation, shift/device validation, refund/cancel events and separately authorized returns. Verify retry collisions, insufficient stock atomic rollback, wallet pending, cash change and historical costing.
- [x] POS/order/receipt UI: category search, cart/add-ons, dine-in/takeout, discounts, checkout, history and correction controls. Verify accessible browser interactions.
- [x] Offline persistence and sync: cache user/shop/device scope and time limit, durable local commits, pending/failed states, retry and queue export/import. Verify browser refresh/outage/reconnect/retry and expired configuration behavior.
- [x] Reporting/dashboard/CSV/audit: all financial definitions and date ranges, zero/missing/estimated distinctions, low stock and reconciliation. Verify against known SQL fixture.
- [x] Settings/access/recovery: business profile, receipt/hours/method policies, designated device, existing-account memberships, last-founder safety, password reset/change, private document policies. Verify RLS and hostile requests.
- [x] Expand and test Supabase pre-opening seeder and exact scoped cleanup after all module contracts stabilize. No fake sales in default pre-opening seed.
- [x] Backup/restore and device recovery tooling/docs; isolated database dump/restore drill. Production connection and external email are explicitly separate gates.
- [x] Final lint/type/unit/SQL/build/browser checks and independent transaction review; update implementation status using actual evidence.

## External deployment gates

These are environment verification tasks, separate from completed local module implementation. See docs/IMPLEMENTATION_STATUS.md for test scope.

- [ ] Apply only pending migrations to the intended hosted Supabase project, then run the optional preparation seeder.
- [ ] Verify hosted founder/staff sessions, disable public signup, and test SMTP invitation/recovery delivery and redirect templates.
- [ ] Verify private Storage uploads/downloads, configure database and object backups, and complete an isolated hosted restore drill.
- [ ] Check offline operation, receipt printing and performance on the actual POS hardware before live operations.

