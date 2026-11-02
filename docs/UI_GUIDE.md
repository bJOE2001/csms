# Finding your way around

The Overview is the starting point. **Your next steps** recommends an action from the shop's recorded menu and stock setup. The checklist shows where records have been added; it does not certify that every ingredient or product is ready for live selling.

## Find a page

Desktop navigation stays on the left and groups pages by the work they support:

| Group | What you do here |
| --- | --- |
| Daily workspace | Overview, POS, orders/receipts and cashier shifts |
| Menu & stock | Products, recipes, ingredients, stock, suppliers and purchases |
| Money & insights | Expenses, founder funding, startup budget and reports |
| Administration | Staff access, business settings and audit history |

Choose **Find a page or task**, or press **Ctrl+K** (Command+K on Mac). Search with familiar tasks such as “stock count”, “supplier”, “receipt” or “cash”. Search and navigation show only pages available to your role.

On a phone, use **Menu** to open the same grouped navigation. The magnifying-glass button opens page search. Sign out is at the bottom of the mobile menu.

## Know what to do next

Each page starts with a short workflow explanation and a main action near its title. For example, **New purchase** jumps to the purchase form and **Update stock** jumps to the stock actions. Related links connect the next part of the workflow.

- **Prepare a menu:** add a category/product → define ingredients and publish recipes → enable reviewed variants.
- **Add real stock:** record an initial physical count, or plan/order a purchase and receive the actual delivery. Plans do not create stock.
- **Record money:** use Startup budget for a plan, Expenses for real spending and Founder funding for contributions/loans. Review pending financial records before treating them as approved or confirmed.
- **Run the till:** register a device in Business settings → open a cashier shift → use the POS → synchronize every order → count closing cash and close the shift.
- **Review activity:** use Orders & receipts for payments and receipts, Business reports for period summaries and Audit trail for permanent change history.

The overview keeps detailed monthly reports behind a disclosure so the next action stays easy to find. This browser's local synchronization status is separate from server-confirmed sales.

## Runtime and offline cache update

The service worker now caches only content-versioned production assets. It retires older application-shell caches without deleting the POS IndexedDB queue, following [service-worker cache versioning guidance](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching). Development output uses `.next-dev/`; production uses `.next/`, so a production build cannot overwrite the running development server's generated modules. This uses Next.js's [configured build directory](https://nextjs.org/docs/pages/api-reference/config/next-config-js/distDir). Isolated development browser tests use `.local/next-integration-dev/`.

After this update, refresh an already open tab once the new worker activates. Do not clear browser storage to troubleshoot: export unsynchronized orders from the POS before replacing a browser/device or removing its data. See `OPERATIONS.md` for recovery.

The UI redesign adds no database migrations and does not change existing business records or accounting rules.
