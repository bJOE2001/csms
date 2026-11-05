"use client";
import { LoadingLink as Link } from "./ui/loading-link";
import { money, summarize, type Sale, type Expense } from "@/lib/sales/domain";
import { ExportSales } from "./export-sales";
import { DateRangeFilter } from "./date-range-filter";
import { SalesRecords } from "./sales-records";
import { periodDates } from "@/lib/sales/period";
import { useReportSnapshot } from "@/lib/use-report-snapshot";
import type { ReceiptBusinessDetails } from "@/lib/sales/receipt";
export function SalesView({
  sales: loadedSales,
  expenses: loadedExpenses = [],
  shopId,
  shopName,
  founder,
  timezone,
  from,
  to,
  loadError,
  business,
}: {
  sales: Sale[];
  expenses?: Expense[];
  shopId: string;
  shopName: string;
  founder: boolean;
  timezone: string;
  from: string;
  to: string;
  loadError?: string;
  business?: ReceiptBusinessDetails;
}) {
  const report = useReportSnapshot(shopId, loadError ? null : { sales: loadedSales, expenses: loadedExpenses, from, to });
  const sales = report?.sales ?? [];
  const expenses = report?.expenses ?? [];
  const appliedFrom = report?.from ?? from;
  const appliedTo = report?.to ?? to;
  const summary = summarize(sales, expenses);
  return (
    <div className="sales-management grid gap-6">
      <header className="sales-header">
        <div className="sales-heading">
          <h1 className="m-0">Sales</h1>
          <p className="hint mb-0 mt-2">
            View transactions, receipts, and payment records.
          </p>
        </div>
        <div className="sales-header-actions sales-date-range">
          <DateRangeFilter from={appliedFrom} to={appliedTo} loadFailure={loadError ? { from, to, message: loadError } : undefined} />
          {report && <ExportSales
            report={{ shopName, timezone, from: appliedFrom, to: appliedTo, sales, expenses }}
          />}
        </div>
        {report && <p className="sales-period">Reporting period: <strong>{periodDates(appliedFrom, appliedTo)}</strong></p>}
      </header>
      {report && <>
      <section className="sales-overview" aria-label="Sales overview">
        <dl className="sales-secondary-metrics sales-transaction-metrics">
          {[
            { label: "Net Sales", value: money(summary.total) },
            { label: "Completed Transactions", value: summary.orders },
            { label: "Cash", value: money(summary.cash) },
            { label: "E-wallet", value: money(summary.wallet) },
            { label: "Refunded Transactions", value: summary.refunds },
          ].map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <p className="sales-report-notes"><Link href={`/dashboard?from=${appliedFrom}&to=${appliedTo}`}>View business performance on Dashboard</Link></p>
        {summary.missingCosts > 0 && (
          <p role="status" className="form-message error">
            Profit is incomplete: {summary.missingCosts} sale(s) have no saved
            product cost.{" "}
            {founder
              ? "Open each affected receipt and choose Record missing cost. Set product costs in Menu for future sales."
              : "Ask the owner to record the missing cost on each affected receipt."}
          </p>
        )}
      </section>
      <SalesRecords sales={sales} shopId={shopId} shopName={shopName} timezone={timezone} founder={founder} from={appliedFrom} to={appliedTo} business={business} />
      </>}
    </div>
  );
}
