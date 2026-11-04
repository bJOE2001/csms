# Business Dashboard

`/dashboard` provides owner analytics; `/app/sales` remains the transaction reporting route. Dashboard is first in the existing sidebar and navigation drawer. Dashboard does not change existing POS entry routes or authentication redirects.

## Access and data

Dashboard authenticates with `requireMember` and checks the existing `founder` role on the server before entering its reporting Suspense boundary or fetching financial data. Staff return to POS. No database schema, API contract, receipt, or checkout changes are required.

`loadSalesReport` shares the existing `pos_sales` and `pos_expenses` readers with Sales. Dashboard aggregates those period records on the server with the existing `summarize` function. Its browser payload contains financial totals, bounded chart points, top-five rankings, and five recent receipts, rather than the full period history. A separate preceding-period sales read is optional; its failure does not discard the current report. This reuses the existing maximum 367-day inclusive reporting range. Very high transaction volumes may eventually justify database-side aggregation, but no parallel financial definitions or new reporting API were introduced here.

## Accounting and historical integrity

Net sales include completed receipts only. Refunded receipts contribute no revenue, but their recorded preparation costs remain deducted. Cancelled receipts do not contribute costs or revenue. Unknown historical costs make gross and net profit incomplete. Voided expenses are excluded. Net profit is explicitly based on recorded product costs and operating expenses, not a claim to include every accounting cost.

Product and size rankings use immutable receipt item names, sizes, quantities, and prices. They rank by quantity, with revenue as a deterministic tie-breaker. Transaction discounts are allocated proportionally to recorded item values using integer-cent largest-remainder allocation. Missing item revenue is disclosed rather than attributed to current products. Current menu records never relabel old transactions. Historical categories are not present in existing item snapshots, so category analytics explicitly remain unavailable; no inference or fabricated results are displayed.

## Periods and interactions

All sections, including Recent Transactions, follow the selected inclusive shop-timezone reporting range. Automatic date filters retain their existing validation and request supersession. The preceding comparison covers the same number of calendar days immediately before the selected range. Percentage changes require a positive recorded previous-period revenue denominator. Zero or unavailable baselines do not produce fabricated percentages.

The chart groups by hour for one day, day for up to 45 days, week for up to 180 days, and month thereafter. It uses a small responsive SVG with currency axes, pointer inspection, a keyboard-accessible period selector, and an expandable data table. Chart font sizing follows actual container width. There is no new chart dependency or entrance animation.

Initial loading reuses the persistent application shell, global top bar, and shared skeleton. Date refreshes retain usable content; failures identify previous results explicitly. Shared SalesRecords keeps receipt details, printing, statuses, and actions consistent. Sales retains CSV export, search, pagination, and a compact transaction summary; its large profitability cards move to Dashboard.

## Compact presentation

Dashboard-specific styles reuse the existing spacing, surface, border, radius, and focus tokens. Content uses 24px outer padding (16px on mobile), 16px section gaps and card padding, naturally sized equal-height KPI cards, and a seven-metric strip when its actual container width allows. Container queries pair Sales Performance with Top Products at approximately 65/35 and Payment Breakdown with Product Insights at 50/50; narrower containers stack without changing navigation.

The chart retains its 240px SVG plot, currency labels, pointer tooltip, aggregation, and timezone. Its keyboard period selector and exact-value table now share one initially collapsed **View chart data** disclosure. Product Insights retains size rankings and compact expandable explanations for size history and unavailable historical categories. The visible profit scope disclosure retains the full refund/cancellation explanation. Critical missing-cost and unattributed-revenue messages remain visible.

Recent Transactions reuses SalesRecords unchanged. Only Dashboard-scoped table padding is reduced; receipt actions retain their existing 40px desktop / 44px touch targets. Initial Dashboard skeletons follow the same analytics layout. No financial service, API, schema, or report calculation changes are part of this refinement.

### Measured browser comparison

Measurements use the same deterministic UI test report, loaded fonts, collapsed optional details, and CSS viewport dimensions. Dataset length, long labels, validation messages, and expanded details can increase height naturally; these are observations, not fixed sizing constraints.

| CSS viewport | Before height | After height | Reduction |
| --- | ---: | ---: | ---: |
| 1440 × 900 | 2,280px | 1,405px | 38.4% |
| 1280 × 800 | 2,316px | 1,405px | 39.3% |
| 1032 × 1376 | 2,328px | 1,473px | 36.7% |
| 960 × 1440 | 2,360px | 1,532px | 35.1% |
| 768 × 1024 | 3,097px | 1,918px | 38.1% |
| 393 × 852 | 4,273px | 3,366px | 21.2% |

At 1440px, KPI cards measure 106px instead of 152px; ranking rows measure 40px and transaction rows approximately 49px including separators. Top Products moves from y=1,119px to y=373px; Payment Breakdown moves from y=1,119px to y=747px. All ten displayed primary and secondary financial values match their before-refinement snapshots. Screenshots and measurements are local review artifacts in `.local/ui-review/dashboard-compact/`; capture the baseline with `DASHBOARD_CAPTURE_BASELINE=1` before editing, then run `dashboard-compact.spec.ts` normally to compare.

Validation: 38 distinct browser component tests across Dashboard, compact layout, shared navigation and loading; 23 reporting/route unit tests; four production-server end-to-end tests covering the Dashboard authentication boundary and shared route loading. Lint, TypeScript, production build, and whitespace checks pass. Browser screenshots were inspected at all six sizes, including mobile chart and receipt-table views. Financial assertions use fixtures; no live business records were modified or reconciled against the database.
