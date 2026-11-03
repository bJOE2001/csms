# Daily use

Open POS, choose products, adjust quantities and select Cash or GCash. Leave cash received blank for exact payment, or enter it to see change. Confirm a GCash payment has arrived before completing the sale.

Use Add product or Edit in Menu Management. Enter name, selling price, cost per item and availability. Include ingredients and packaging in the cost. Use zero only for a genuinely cost-free item. Updating cost affects future sales only.

Sales shows revenue, gross profit and net profit for your chosen dates, plus order counts, operating expense totals and payment breakdown. Open a receipt for printing or a full refund after returning payment to the customer. The operating expense metric links to Expenses for the same dates.

In Expenses, use Add Expense for rent, wages, utilities, fees and other overhead. Date expenses to the period they belong to; avoid counting product costs twice. Edit an active entry to correct its date, description or amount. Delete asks for confirmation and retains the entry as Voided, excluding it from totals. Owners manage records; members have read-only access. Search descriptions, dates or statuses, and choose From Date/To Date to filter records. Sales uses the same records and reflects changes when refreshed.

In Sales and Expenses, choose **From Date** and **To Date**. A complete, valid range updates automatically after a brief pause; there is no Apply Dates button. Dates are inclusive and use the shop's reporting timezone. The default is the shop's current date. Missing dates, reversed dates and ranges longer than 366 days show guidance and keep the current report visible. Totals and CSV exports continue to use the loaded range while a new range is being fetched. The export dialog identifies its report dates.

Gross and net margins express each profit as a percentage of revenue. For example, PHP 2,000 net profit on PHP 10,000 revenue is a 20% net margin. Negative margins represent losses. Margins show **Unavailable** when revenue is zero or product costs are missing. The profit-summary CSV includes the same margin calculations, with unavailable values left blank.

The receipt shows your shop name, sale date, quantities, unit prices, total and payment status. Cash received and change appear only when recorded; refunded and cancelled sales are clearly marked. **Print receipt** creates a compact customer copy suitable for 80 mm paper or saving as PDF. Print and Close stay visible while you scroll. Preparation costs, source notes and refund management remain under **Business details** and are excluded from the printout.

If checkout loses its connection, retry the saved sale. Refreshing preserves the same pending sale ID. Resolve it before starting another sale. Never clear browser storage while a sale is unresolved.

Gross profit deducts saved product costs; net profit also deducts recorded expenses. Refunded prepared products retain their costs. Refunds change the original sale period; cancelled sales do not affect profit. Unknown historical costs make profit incomplete rather than assuming zero. Enter all relevant costs and expenses for a useful net profit figure.

To complete a historical cost, sign in as the owner, open **Sales**, choose the date range and click the receipt number marked **Cost missing**. Choose **Record missing cost**. Enter the total preparation cost for every item and quantity on that receipt, add a source note, review it and choose **Save preparation cost**. For a refunded drink that cost PHP 35, enter 35, not the refunded selling price. Use 0 only if nothing was prepared or consumed. Profit updates for the original sale date. This is a one-time entry with an owner/timestamp audit record; saved costs cannot be overwritten. The feature requires migration `202611020003_record_missing_cost.sql`.

To keep a spreadsheet record, choose dates in **Sales** and wait for the report to update, choose **Export CSV**, select **Profit summary**, **Sales history** or **Operating expenses**, then choose **Download CSV**. Downloads include every record in the loaded date range, even when table search hides rows. Incomplete or invalid date edits do not change the export. Values are in PHP with two decimal places; unknown profit and costs remain blank and explicitly marked incomplete. Sales includes refunded/cancelled receipts; expenses includes voided entries and separates original amounts from amounts deducted. Download one file at a time as needed. A CSV is a report snapshot, not a full database backup.

For your first business-day check:

1. Confirm product costs in Menu before selling and complete any missing historical costs on receipts.
2. Record the operating expenses belonging to that date, without counting ingredient costs twice.
3. Resolve pending checkouts and compare completed payments against the matching cash/GCash records. Review refunds separately: this report restates the original sale date, so a later refund can differ from cash movement on its refund date.
4. Download the three CSVs. Check that revenue minus deducted product costs equals gross profit, and gross profit minus active expenses equals net profit. Keep the files with your own payment and expense records.

Menu → Add product manages the catalog. Products without sizes use the regular selling price and direct cost. Add size creates custom labels with individual prices/costs; choose a default size and set availability per size. Category assignment and descriptions are optional. Product images accept your own HTTPS URL or local asset path. Removing a size affects future orders only. Delete archives a product and preserves receipts. An assigned category must be reassigned before it can be deleted.

POS contains no maintenance forms. Select a size before adding a sized product. Different sizes appear separately in the cart; quantity controls keep the selected size. If another tab changes a menu price or label, review the offered current option explicitly. If it removes or disables the option, remove that cart line. The original cart amount remains visible until review. Use Refresh if a remote menu edit is not yet visible.
