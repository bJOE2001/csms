"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { money, summarize, type Sale, type Expense } from "@/lib/sales/domain";
import { ExportSales } from "./export-sales";
import { ReceiptDialog } from "./receipt-dialog";
import { ReceiptPrint } from "./receipt-print";
import { DateRangeFilter } from "./date-range-filter";
import { SummaryCards, Card } from "./ui/card";
import { DataTable } from "./ui/data-table";
export function SalesView({
  sales,
  expenses = [],
  shopId,
  shopName,
  founder,
  timezone,
  from,
  to,
}: {
  sales: Sale[];
  expenses?: Expense[];
  shopId: string;
  shopName: string;
  founder: boolean;
  timezone: string;
  from: string;
  to: string;
}) {
  const summary = summarize(sales, expenses);
  const [print, setPrint] = useState<string>();
  const closePrint = useCallback(() => setPrint(undefined), []);
  const printSale = sales.find((sale) => sale.id === print);
  return (
    <div className="sales-management grid gap-6">
      <header className="sales-header">
        <div className="sales-heading">
          <h1 className="m-0">Sales</h1>
          <p className="hint mb-0 mt-2">
            Track sales, product costs, and operating expenses.
          </p>
        </div>
        <div className="sales-header-actions sales-date-range">
          <DateRangeFilter from={from} to={to} />
          <ExportSales
            report={{ shopName, timezone, from, to, sales, expenses }}
          />
        </div>
      </header>
      <section className="sales-overview" aria-label="Sales overview">
        <SummaryCards
          items={[
            { label: "Sales Revenue", value: money(summary.total) },
            {
              label: "Gross Profit",
              value:
                summary.grossProfit === null
                  ? "Incomplete"
                  : money(summary.grossProfit),
            },
            {
              label: "Net Profit",
              value:
                summary.netProfit === null
                  ? "Incomplete"
                  : money(summary.netProfit),
            },
          ]}
        />
        <dl className="sales-secondary-metrics">
          {[
            { label: "Completed Sales", value: summary.orders },
            { label: "Average Sale", value: money(summary.average) },
            {
              label: "Product Costs",
              value: money(summary.productCosts),
              note: summary.missingCosts > 0 ? "Known costs only" : undefined,
            },
            { label: "Operating Expenses", value: money(summary.operatingExpenses), href: `/expenses?from=${from}&to=${to}` },
            { label: "Cash Sales", value: money(summary.cash) },
            { label: "GCash / Wallet Sales", value: money(summary.wallet) },
            {
              label: "Reversed Sales",
              value: sales.filter((sale) => sale.status !== "completed").length,
            },
          ].map(({ label, value, note, href }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{href ? <Link href={href} aria-label={`Manage operating expenses: ${value}`}>{value}</Link> : value}</dd>
              {note && <small>{note}</small>}
            </div>
          ))}
        </dl>
        {summary.missingCosts > 0 && (
          <p role="status" className="form-message error">
            Profit is incomplete: {summary.missingCosts} sale(s) have no saved
            product cost.{" "}
            {founder
              ? "Open each affected receipt and choose Record missing cost. Set product costs in POS for future sales."
              : "Ask the owner to record the missing cost on each affected receipt."}
          </p>
        )}
      </section>
      <Card className="sales-section sales-history">
        <DataTable
          toolbarLeading={
            <div className="sales-section-heading">
              <h2>Sales History</h2>
              <p className="hint">
                View completed transactions and payment details.
              </p>
            </div>
          }
          caption="Sales history"
          searchPlaceholder="Search receipt or payment method"
          emptyMessage="No sales records found for the selected period."
          columns={[
            { key: "actions", label: "Receipt" },
            { key: "date", label: "Date" },
            { key: "method", label: "Payment" },
            { key: "total", label: "Total", numeric: true },
            { key: "status", label: "Status" },
          ]}
          rows={sales.map((s) => ({
            id: s.id,
            search: `${s.id} ${s.method} ${s.status}`,
            cells: {
              date: new Intl.DateTimeFormat("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              }).format(new Date(s.created_at)),
              method:
                s.method === "cash"
                  ? "Cash"
                  : s.method === "gcash"
                    ? "GCash"
                    : s.method,
              total: money(s.total_cents),
              status: (
                <>
                  <span
                    className={`sales-status ${s.status === "completed" ? "sales-status-completed" : ""}`}
                  >
                    {s.status}
                  </span>
                  {s.total_cost_cents == null && s.status !== "cancelled" && (
                    <small className="block text-muted-foreground">
                      Cost missing
                    </small>
                  )}
                </>
              ),
              actions: (
                <ReceiptDialog
                  sale={s}
                  shopId={shopId}
                  shopName={shopName}
                  timezone={timezone}
                  founder={founder}
                  onPrint={() => setPrint(s.id)}
                />
              ),
            },
          }))}
        />
      </Card>
      {printSale && (
        <ReceiptPrint
          sale={printSale}
          shopName={shopName}
          timezone={timezone}
          onClose={closePrint}
        />
      )}
    </div>
  );
}
