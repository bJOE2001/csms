# Daily use

On desktop, use the sidebar to switch between POS, Menu, Sales, Expenses and Libraries; Sign out stays at the bottom. On tablet and phone, open the menu button beside the logo to find the same links and Sign out. Choose a module, use the close button, press Escape or tap outside the drawer to close it. The separate Cart button continues to open your current order.

Open POS, choose products with Add to cart, then open Cart to adjust quantities and select Cash or E-wallet. The filled Added to cart label and small quantity indicator show what is already selected; use the plus and minus controls in Cart to change quantities. Decreasing to zero restores Add to cart. Card and cart quantities stay synchronized for the selected size. Use the trash icon to remove an entire cart line immediately, then Place an order to complete the sale. Leave cash received blank for exact payment, or enter it to see change. Confirm an E-wallet payment has arrived before completing the sale.

Use Add product or Edit in Menu Management. Enter name, selling price, cost per item and availability. Include ingredients and packaging in the cost. Use zero only for a genuinely cost-free item. Updating cost affects future sales only.

Sales shows revenue, gross profit and net profit for your chosen dates, plus order counts, operating expense totals and payment breakdown. Open a receipt for printing or a full refund after returning payment to the customer. The operating expense metric links to Expenses for the same dates.

In Expenses, use Add Expense for rent, wages, utilities, fees and other overhead. Date expenses to the period they belong to; avoid counting product costs twice. Edit an active entry to correct its date, description or amount. Delete asks for confirmation and retains the entry as Voided, excluding it from totals. Owners manage records; members have read-only access. Search descriptions, dates or statuses, and choose From Date/To Date to filter records. Sales uses the same records and reflects changes when refreshed.

In Sales and Expenses, choose **From Date** and **To Date**. A complete, valid calendar selection updates immediately; manual typing updates after a brief pause. There is no Apply Dates button. Dates are inclusive and use the shop's reporting timezone. The default is the shop's current date. Missing dates, reversed dates and ranges longer than 366 days show guidance and keep the current report visible. Totals and CSV exports continue to use the loaded range while a new range is being fetched. The export dialog identifies its report dates.

Gross and net margins express each profit as a percentage of revenue. For example, PHP 2,000 net profit on PHP 10,000 revenue is a 20% net margin. Negative margins represent losses. Margins show **Unavailable** when revenue is zero or product costs are missing. The profit-summary CSV includes the same margin calculations, with unavailable values left blank.

The receipt shows your shop name, sale date, quantities, unit prices, total and payment status. Cash received and change appear only when recorded; refunded and cancelled sales are clearly marked. **Print receipt** creates a branded customer copy for 80 mm paper (default), 58 mm paper, or saving as PDF. Choose the matching Paper width and printer-dialog setting; receipt preparation waits for the original logo and fonts. Print and Close stay visible while you scroll. Preparation costs, source notes and refund management remain under **Business details** and are excluded from the printout.

If checkout loses its connection, retry the saved sale. Refreshing preserves the same pending sale ID. Resolve it before starting another sale. Never clear browser storage while a sale is unresolved.

Gross profit deducts saved product costs; net profit also deducts recorded expenses. Refunded prepared products retain their costs. Refunds change the original sale period; cancelled sales do not affect profit. Unknown historical costs make profit incomplete rather than assuming zero. Enter all relevant costs and expenses for a useful net profit figure.

To complete a historical cost, sign in as the owner, open **Sales**, choose the date range and click the receipt number marked **Cost missing**. Choose **Record missing cost**. Enter the total preparation cost for every item and quantity on that receipt, add a source note, review it and choose **Save preparation cost**. For a refunded drink that cost PHP 35, enter 35, not the refunded selling price. Use 0 only if nothing was prepared or consumed. Profit updates for the original sale date. This is a one-time entry with an owner/timestamp audit record; saved costs cannot be overwritten. The feature requires migration `202611020003_record_missing_cost.sql`.

To keep a spreadsheet record, choose dates in **Sales** and wait for the report to update, choose **Export CSV**, select **Profit summary**, **Sales history** or **Operating expenses**, then choose **Download CSV**. Downloads include every record in the loaded date range, even when table search hides rows. Incomplete or invalid date edits do not change the export. Values are in PHP with two decimal places; unknown profit and costs remain blank and explicitly marked incomplete. Sales includes refunded/cancelled receipts; expenses includes voided entries and separates original amounts from amounts deducted. Download one file at a time as needed. A CSV is a report snapshot, not a full database backup.

For your first business-day check:

1. Confirm product costs in Menu before selling and complete any missing historical costs on receipts.
2. Record the operating expenses belonging to that date, without counting ingredient costs twice.
3. Resolve pending checkouts and compare completed payments against the matching cash/E-wallet records. Review refunds separately: this report restates the original sale date, so a later refund can differ from cash movement on its refund date.
4. Download the three CSVs. Check that revenue minus deducted product costs equals gross profit, and gross profit minus active expenses equals net profit. Keep the files with your own payment and expense records.

Libraries → Product Categories manages reusable product categories. Add, rename and delete unused categories there; assigned categories must be reassigned in Menu before deletion. Menu → Add product manages products. Products without sizes use the regular selling price and direct cost. Add size creates custom labels with individual prices/costs; choose a default size and set availability per size. Category assignment and descriptions are optional. Product Image defaults to Upload Image: choose or drop one JPG, PNG or WebP file up to 5 MB, preview it, and save the product. Replace Image changes the draft; Remove Image clears it when saved. Image URL supports your existing HTTPS URL or local asset path. Cancelling uploads nothing, and failed saves retain the draft for retry. Removing a size affects future orders only. Delete archives a product and preserves receipts. An assigned category must be reassigned before it can be deleted.

POS contains no maintenance forms. On tablets and phones, use the Cart button beside or below search to open checkout. Its badge shows the total quantity. Close the drawer to keep browsing; items, selected sizes, payment method and entered cash remain unchanged. The configured default size is selected automatically; use the inline size pills to choose another before adding a sized product. Different sizes appear separately in the cart; quantity controls keep the selected size. If another tab changes a menu price or label, review the offered current option explicitly. If it removes or disables the option, remove that cart line. The original cart amount remains visible until review. Use Refresh if a remote menu edit is not yet visible.

Management tables show 10 rows initially. Use **Rows per page** to choose 10, 25 or 50, and the labeled first, previous, next and last page buttons to browse. The range counts only records matching your search and filters. Changing search, filters, sorting or page size returns to page 1. Saving a record keeps the current page where possible; removing its last matching row returns to the nearest valid page. Reloading or opening another module starts with 10 rows on page 1. Sales and expense totals and CSV exports always cover the full selected reporting period, including records on other pages.


### Operation notifications

`NotificationProvider` mounts one Sonner toaster in the root layout, outside page and dialog containers. Use `notify.success`, `notify.error`, `notify.warning`, or `notify.info` from `src/lib/notify.ts`; do not mount module-specific toasters or add transient result banners. Shared styles live in `src/app/notifications.css` and use the existing brand and semantic color tokens.

Notifications float at the viewport's top center with safe-area margins, a 420px maximum width, semantic Lucide icons, a dismiss button, and at most three visible toasts. Success/info last 4 seconds, warnings 5.5 seconds, and recoverable errors 7.5 seconds. Critical messages can remain until dismissed. Repeated active messages update one toast; logical operation IDs replace stale feedback. A fresh Sonner instance ID after dismissal protects fast responses from a prior scheduled dismissal.

`MutationForm` sends confirmed operation results to the shared helper. Set `validation: true` on an `ActionState` only for correctable form validation that must remain inline. Field errors, date validation, loading failures with recovery controls, missing-cost warnings, pending-payment guidance, and confirmations remain in context. Selecting or removing a draft image is not an upload success; upload confirmation follows a successful product save.

Sonner supplies polite announcements and keyboard navigation (`Alt+T`), hover/focus timer pausing, and reduced-motion behavior. `Alt+Shift+D` dismisses the latest toast even while a dialog retains its focus trap. Dismissing a notification must not close a dialog, discard a draft, or move focus away from its active field.


### CRUD dialog layout

`AppFormDialog` and `AppConfirmDialog` share the installed Radix/shadcn `Dialog` shell. The form variant focuses the first usable field; confirmations use `alertdialog` semantics, initially focus the safe cancel action, and ignore outside clicks. `FormDialog` retains trigger, dirty-draft, pending, and completion behavior. Its discard confirmation opens above the still-mounted feature form, preserving uncontrolled inputs and selected files. Radix restores focus when the confirmation has finished closing.

Use `size="sm"` for categories and confirmations (448px maximum), `md` for expenses and preparation costs (560px), and `lg` for product management (760px). Sizes, 16px field gaps, and existing brand colors resolve through shared tokens. Header, body and footer styles live in `src/app/dialogs.css`; avoid feature-specific header/footer padding and width overrides.

`MutationForm` remains the sole form and submit handler. Its fields and inline validation scroll inside `DialogBody`; Cancel and Submit remain in the sibling `DialogFooter`. Pending submissions disable fields, actions and dismissal. The positioned body also contains absolutely positioned accessible upload/select proxies. Short forms size naturally; long forms scroll without moving the header or footer. Receipt content and CSV export reuse the same layout; POS and navigation drawers retain their independent workflows.


### Global loading

`LoadingProvider` mounts one 3px Caramel `GlobalLoadingBar` in the root layout, alongside the existing toast provider. It uses explicit, idempotent scopes rather than intercepting `fetch`. Indeterminate movement and a polite status communicate pending work without numeric percentages. CSS fades completed work without delaying requests; reduced motion uses a static line. Static `Skeleton` and `WorkspaceSkeleton` components reserve initial product/table/summary space without presenting zero values or false empty states.

`WorkspaceFrame` owns the shared navigation and content viewport across the five existing module routes. `WorkspaceShell` supplies the loaded shop name and feature content; it keeps its standalone presentation for isolated previews. Module navigation resets the content viewport, while report date changes retain its scroll and data. Root ownership also preserves navigation drawer, logo, loading coordinator, and notification instances during ordinary route changes. Authentication and API authorization remain in their existing page and route handlers.

`LoadingLink` keeps Next Link prefetching and normal modified/external-link behavior, using a root-owned React transition for supported string href navigation. The signal outlives a closed drawer or unmounted link. Catalog GETs explicitly release superseded/unmounted scopes and retain their existing latest-request guard. Report filters signal their existing pending transitions; successful report mutations refresh within a root transition so closing the form does not orphan feedback. Local submit/upload/checkout pending buttons remain separate.

POS, Menu, and Libraries use route loading boundaries plus catalog initialization skeletons. Sales and Expenses place Suspense around report queries after `requireMember`, keeping authentication ahead of streaming and preserving redirect behavior. The RPC contracts, reporting timezone, financial calculations, and last successful report snapshots are unchanged. Existing table rows/counts remain visible during refresh, with pagination disabled until it finishes. Initial empty tables use skeletons; genuine empty states appear only after loading completes.


## Business Dashboard and transaction reporting

Dashboard follows the existing Warm Espresso & Caramel tokens, white bordered KPI surfaces, compact metric strips, responsive ranked lists, and a container-sized SVG sales chart. Its screen-reader data table and keyboard-operable chart expose exact values without relying on color or pointer hover. Three primary KPIs stack on phones; the chart and analytical sections reflow without page-level horizontal scrolling. Dashboard appears first in the existing desktop sidebar and compact navigation drawer. Owner authorization runs on the server before financial loading. Sales uses a compact transaction strip and shared receipt table. See [DASHBOARD.md](DASHBOARD.md) for accounting definitions, reporting scope, and unsupported historical category analytics.

## Tablet reports

Dashboard, Sales and Expenses use the existing 768–1279px tablet breakpoint, 24px page gutters, 16px section/card spacing and the unchanged Espresso header with its navigation drawer. Titles sit above a left-aligned row of equal date controls and existing page actions. Automatic filtering, validation, reporting periods and the global loading bar retain their current behavior.

Dashboard metrics use a three-column, two-row grid. Portrait charts and Top Products stack at full width. Sales uses a balanced three-plus-two metric arrangement below 960px, retaining five readable columns on wider tablets. Expenses uses two columns and two rows with complete, unbroken currency amounts. Tablet-only table spacing gives receipts and descriptions more useful width while retaining 44px action buttons, all columns, tooltips, pagination and the existing accessible scroll affordance when exceptionally wide records require it. Desktop arrangements and mobile Sales/Expenses presentation are unchanged; mobile Dashboard metrics now wrap into two columns.

Layout tests use fixture data only and compare all financial values against pre-change captures. They do not modify or reconcile live business records. The existing mobile Expense card layout may still wrap unusually long amounts; the tablet refinement does not shrink its typography or truncate digits.

Validation on November 5, 2026: 54 focused UI tests passed across reports, tables, navigation and expense workflows. The seven-viewport report suite was then expanded and rerun successfully, including tablet calendar positioning, automatic dates, keyboard chart inspection, search, pagination reset, receipt viewing, CSV download, and expense-dialog access. TypeScript, ESLint, the production build, 28 financial unit tests and four production-server end-to-end checks passed. Screenshots were inspected at all seven requested CSS viewport sizes. Physical iPad hardware and live-account financial data were not exercised.

## Remove unsubmitted cart items

Before checkout, use each cart line’s trash button to remove unwanted items. Removing unsubmitted items sends no API request, saves no transaction and does not increase Refunded Transactions. No separate cancellation action is provided. Existing checkout processing and saved-sale retry protections remain in place.

For a completed sale, the owner returns the full payment and records **Refund sale** from the receipt, including a required reason. Historical receipts stay in Sales. Dashboard, Sales and the summary CSV label the refund-only count **Refunded Transactions** (sentence case in CSV); legacy cancellations are not counted as refunds.

Payment controls, receipts, Sales search and CSV exports display **E-wallet**. Existing payments and checkout requests retain the internal `gcash` identifier for compatibility; no payment records or API contracts are migrated. Search accepts both the current display label and the existing stored identifier.
