"use client";
import { money } from "@/lib/sales/domain";
import { periodDates } from "@/lib/sales/period";
import type { DashboardReport, Performance } from "@/lib/sales/dashboard";
import { useReportSnapshot } from "@/lib/use-report-snapshot";
import { DateRangeFilter } from "../date-range-filter";
import { Card, CardHeader } from "../ui/card";
import { LoadingLink as Link } from "../ui/loading-link";
import { SalesRecords } from "../sales-records";
import { SalesChart } from "./sales-chart";

function RankedList({ rows, empty }: { rows: Performance[]; empty: string }) {
  const maximum = rows[0]?.quantity ?? 0;
  return rows.length ? <ol className="performance-list">{rows.map((row, i) => <li key={row.name}>
    <span className="performance-rank">{i + 1}</span>
    <div className="performance-product"><strong>{row.name}</strong><span className="performance-track" aria-hidden="true"><span style={{ width: `${maximum ? row.quantity / maximum * 100 : 0}%` }} /></span></div>
    <div className="performance-values"><strong>{money(row.revenue)}</strong><span>{row.quantity.toLocaleString("en-PH")} sold</span></div>
  </li>)}</ol> : <p className="dashboard-empty">{empty}</p>;
}

export function DashboardView({ report: loaded, shopId, shopName, timezone, from, to, loadError }: {
  report: DashboardReport | null; shopId: string; shopName: string; timezone: string; from: string; to: string; loadError?: string;
}) {
  const snapshot = useReportSnapshot(shopId, loaded && !loadError ? { data: loaded, from, to } : null);
  const report = snapshot?.data, appliedFrom = snapshot?.from ?? from, appliedTo = snapshot?.to ?? to;
  const summary = report?.summary;
  const salesHref = `/app/sales?from=${appliedFrom}&to=${appliedTo}`;
  const margin = (value: number | null) => value === null ? "Margin unavailable" : `${value.toFixed(1)}% margin`;
  return <div className="dashboard-management">
    <header className="sales-header">
      <div className="sales-heading"><h1 className="m-0">Dashboard</h1><p className="hint">Sales, profitability, and product performance.</p></div>
      <div className="sales-header-actions sales-date-range"><DateRangeFilter from={appliedFrom} to={appliedTo} action="/dashboard" label="Filter dashboard by date" loadFailure={loadError ? { from, to, message: loadError } : undefined} /></div>
      {snapshot && <div className="dashboard-header-meta">
        <p className="sales-period">Reporting period: <strong>{periodDates(appliedFrom, appliedTo)}</strong>{loadError && " · Previous results; update failed."}</p>
        <details className="dashboard-disclosure dashboard-accounting"><summary>Profit based on recorded costs and expenses</summary><p>Profit is based on recorded product costs and operating expenses. Refunds remove revenue; prepared-product costs remain deducted. Cancelled sales are excluded.</p></details>
      </div>}
    </header>
    {report && summary && <>
      <dl className="dashboard-kpis" aria-label="Business performance">
        {[
          { label: "Net Sales", value: money(summary.total), detail: report.comparison ? `${report.comparison.percent >= 0 ? "+" : ""}${report.comparison.percent.toFixed(1)}% vs ${periodDates(report.comparison.from, report.comparison.to)}` : "Previous-period comparison unavailable" },
          { label: "Gross Profit", value: summary.grossProfit === null ? "Incomplete" : money(summary.grossProfit), detail: margin(summary.grossMargin) },
          { label: "Net Profit", value: summary.netProfit === null ? "Incomplete" : money(summary.netProfit), detail: margin(summary.netMargin) },
        ].map(item => <div className="dashboard-kpi" key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd><p>{item.detail}</p></div>)}
      </dl>
      {summary.missingCosts > 0 && <p className="form-message error" role="status">Profit is incomplete: {summary.missingCosts} sale(s) have no saved product cost. <Link href={salesHref}>Review affected receipts in Sales</Link>.</p>}
      {report.unattributedSales > 0 && <p className="dashboard-accounting-note">{report.unattributedSales} completed receipt(s) lack item revenue details. Their revenue is included in totals, but cannot be attributed to products or sizes.</p>}
      <dl className="dashboard-metrics" aria-label="Business metrics">{[
        ["Completed Sales", summary.orders], ["Average Order Value", money(summary.average)],
        ["Product Costs", `${money(summary.productCosts)}${summary.missingCosts ? " · Known costs only" : ""}`],
        ["Operating Expenses", money(summary.operatingExpenses)], ["Cash Sales", money(summary.cash)],
        ["GCash / Wallet Sales", money(summary.wallet)], ["Reversed Sales", report.reversed],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <div className="dashboard-main-analytics">
        <Card className="dashboard-section"><CardHeader title="Sales Performance" /><SalesChart key={`${appliedFrom}:${appliedTo}`} points={report.series} granularity={report.granularity} hasSales={summary.orders > 0} timezone={timezone} /></Card>
        <Card className="dashboard-section"><CardHeader title="Top Products" description="Top five by quantity sold" /><RankedList rows={report.products} empty="No recorded product sales in this period." /><details className="dashboard-disclosure"><summary>Ranking details</summary><p>Completed sales only, grouped by transaction-time name. Item revenue is net of allocated receipt discounts.</p></details></Card>
      </div>
      <div className="dashboard-supporting-analytics">
        <Card className="dashboard-section"><CardHeader title="Payment Breakdown" description="Net sales contribution · not profit." />
          {summary.total > 0 ? <>
            <div className="payment-breakdown-bar" aria-hidden="true"><span style={{ width: `${summary.cash / summary.total * 100}%` }} /><span style={{ width: `${summary.wallet / summary.total * 100}%` }} /></div>
            <dl className="payment-breakdown-legend">{[["Cash", summary.cash], ["GCash / Wallet", summary.wallet]].map(([name, amount]) => <div key={name}><dt>{name}</dt><dd>{money(Number(amount))}<span>{(Number(amount) / summary.total * 100).toFixed(1)}%</span></dd></div>)}</dl>
          </> : <p className="dashboard-empty">No payment revenue in this period.</p>}
        </Card>
        <Card className="dashboard-section"><CardHeader title="Product Insights" description="Size Performance · top five by quantity sold" /><RankedList rows={report.sizes} empty="No size sales in this period." />
          <details className="dashboard-disclosure"><summary>About size history</summary><p>Historical size labels are preserved. No size recorded includes unsized products and older receipts without a size snapshot.</p></details>
          <details className="dashboard-disclosure dashboard-category-note"><summary>Category Performance <span>Historical data unavailable</span></summary><p>Categories were not saved with transaction items. Accurate historical category performance is unavailable. Current menu categories are not used to relabel past sales.</p></details>
        </Card>
      </div>
      <SalesRecords recent sales={report.recent} shopId={shopId} shopName={shopName} timezone={timezone} founder from={appliedFrom} to={appliedTo} actions={<Link className="button secondary compact" href={salesHref}>View all sales</Link>} />
    </>}
  </div>;
}
