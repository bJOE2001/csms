# Business Dashboard

`/dashboard` provides owner analytics; `/app/sales` remains the transaction reporting route. Dashboard is first in the existing sidebar and navigation drawer. Dashboard does not change existing POS entry routes or authentication redirects.

## Access and data

Dashboard authenticates with `requireMember` and checks the existing `founder` role on the server before entering its reporting Suspense boundary or fetching financial data. Staff return to POS. No database schema, API contract, receipt, or checkout changes are required.

`loadSalesReport` shares the existing `pos_sales` and `pos_expenses` readers with Sales. Dashboard aggregates those period records on the server with the existing `summarize` function. Its browser payload contains financial totals, bounded chart points, top-five rankings, and five recent receipts, rather than the full period history. A separate preceding-period sales read is optional; its failure does not discard the current report. This reuses the existing maximum 367-day inclusive reporting range. Very high transaction volumes may eventually justify database-side aggregation, but no parallel financial definitions or new reporting API were introduced here.

## Accounting and historical integrity

Net sales include completed receipts only. Refunded receipts contribute no revenue, but their recorded preparation costs remain deducted. Cancelled receipts do not contribute costs or revenue. Unknown historical costs make gross and net profit incomplete. Voided expenses are excluded. Net profit is explicitly based on recorded product costs and operating expenses, not a claim to include every accounting cost.

Product and size rankings use immutable receipt item names, sizes, quantities, and prices. They rank by quantity, with revenue as a deterministic tie-breaker. Transaction discounts are allocated proportionally to recorded item values using integer-cent largest-remainder allocation. Missing item revenue is disclosed rather than attributed to current products. Current menu records never relabel old transactions. Historical categories are not present in existing item snapshots, so no category results are inferred or fabricated. Size aggregation remains available in the reporting utilities, but Product Insights and its size/category details are no longer rendered on Dashboard.

## Periods and interactions

All Dashboard sections follow the selected inclusive shop-timezone reporting range. Automatic date filters retain their existing validation and request supersession. The preceding comparison covers the same number of calendar days immediately before the selected range. Percentage changes require a positive recorded previous-period revenue denominator. Zero or unavailable baselines do not produce fabricated percentages.

The chart groups by hour for one day, day for up to 45 days, week for up to 180 days, and month thereafter. It uses a small responsive SVG with currency axes, pointer inspection, a keyboard-accessible period selector, and an expandable data table. Chart font sizing follows actual container width. There is no new chart dependency or entrance animation.

Initial loading reuses the persistent application shell, global top bar, and shared skeleton. Date refreshes retain usable content; failures identify previous results explicitly. Transaction history, receipt details, printing and statuses remain available in Sales through the shared SalesRecords component. Sales retains CSV export, search, pagination, and a compact transaction summary; its large profitability cards live on Dashboard.

## Compact presentation

Dashboard-specific styles reuse the existing spacing, surface, border, radius, and focus tokens. Content uses 24px outer padding (16px on mobile), 16px section gaps and card padding, and naturally sized equal-height KPI cards. The compact metric strip contains Completed Sales, Average Order Value, Product Costs, Operating Expenses, Cash Sales, GCash / Wallet Sales and Reversed Sales in one row at every viewport width. Seven equal columns retain a readable 128px minimum; narrower screens scroll horizontally inside the strip without widening the page. The strip supports keyboard focus, a visible focus outline and arrow-key scrolling. Payment values use the existing full-period net sales totals and peso formatting, including zero values for empty periods.

Container queries retain Sales Performance beside Top Products at approximately 65/35 when the available width is at least 900px. Narrower layouts stack naturally. Cash and GCash now appear alongside the other business metrics; the separate Payment Breakdown heading, bar, percentages and loading placeholder are removed. Product Insights and the former supporting-analytics grid are also removed; no new report module is introduced.

The chart retains its 240px SVG plot, currency labels, pointer tooltip, aggregation, and timezone. Its keyboard period selector and exact-value table share one initially collapsed **View chart data** disclosure. Top Products retains its ranking details. The visible profit scope disclosure retains the full refund/cancellation explanation. Critical missing-cost and unattributed-revenue messages remain visible. Reporting and chart source files are unchanged by this simplification, including their historical size aggregation and discount-allocation utilities.

Recent Transactions, its View all sales action and its loading-table placeholder are removed from Dashboard. Dashboard ends with Sales Performance and Top Products. Shared SalesRecords and the Sales workspace remain unchanged, and the reporting utility retains its recent-receipt data for compatibility. Initial Dashboard skeletons follow the same analytics-only layout. No financial service, API, schema, or report calculation changes are part of this refinement.

### Browser validation

Responsive checks use the same deterministic UI test report at 1440, 1280, 1032, 960, 768 and 393 CSS pixels. The metrics retain one row at every width; smaller screens support keyboard scrolling to the final metric without page-level horizontal overflow. Dataset length, long labels, validation messages and expanded details can increase content height naturally.

Desktop KPI cards retain their approximately 106px equal heights, and the chart remains 240px high. All ten primary/secondary financial values, including Cash and GCash totals, and the displayed product rankings match their before-refinement snapshots. Screenshots and measurements are local review artifacts in `.local/ui-review/dashboard-simplified/`; capture the baseline with `DASHBOARD_CAPTURE_BASELINE=1` before editing, then run `dashboard-compact.spec.ts` normally to compare.

Dashboard browser checks cover the seven-metric strip, removal of Payment Breakdown, Product Insights and Recent Transactions, navigation to Sales history, Cash/GCash totals in populated and empty periods, exact-value chart inspection, five-item rankings, large values, automatic date changes, loading coordination and failed-report recovery. Financial assertions use fixtures; no live business records were modified or reconciled against the database.
