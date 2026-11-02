"use client";
import { useCallback, useState } from "react";
import { money, summarize, type Sale, type Expense } from "@/lib/sales/domain";
import { Expenses } from "./expenses";
import { ExportSales } from "./export-sales";
import { ReceiptDialog } from "./receipt-dialog";
import { ReceiptPrint } from "./receipt-print";
import { SalesDateFilter } from "./sales-date-filter";
import { salesPeriods, periodDates } from "@/lib/sales/period";
import { SummaryCards, Card, CardHeader } from "./ui/card";
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
  today,
  period,
}: {
  sales: Sale[];
  expenses?: Expense[];
  shopId: string;
  shopName: string;
  founder: boolean;
  timezone: string;
  from: string;
  to: string;
  today: string;
  period?: string;
}) {
  const summary = summarize(sales, expenses);
  const [print, setPrint] = useState<string>();
  const closePrint = useCallback(() => setPrint(undefined), []);
  const printSale = sales.find((sale) => sale.id === print);
  const selectedPeriod = salesPeriods(today).find(
    (preset) => preset.id === period,
  );
  const margin = (value: number | null) =>
    value === null
      ? "Unavailable"
      : `${new Intl.NumberFormat("en-PH", { maximumFractionDigits: 1 }).format(value)}%`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your business at a glance</p>
          <h1>Sales</h1>
          <p className="hint">
            Track sales, product costs and operating expenses for these dates.
          </p>
        </div>
        <ExportSales
          report={{ shopName, timezone, from, to, sales, expenses }}
        />
      </div>
      <SalesDateFilter
        key={`${period}:${from}:${to}`}
        from={from}
        to={to}
        today={today}
        period={period}
      />
      <div
        className="report-period"
        role="group"
        aria-label="Applied reporting period"
      >
        <p>
          <span className="metric-label">Reporting period</span>
          <strong>{selectedPeriod?.label ?? "Custom dates"}</strong>
          <span>{periodDates(from, to)}</span>
        </p>
        <p className="hint">
          {timezone} ·{" "}
          {period === "week"
            ? "Monday through today"
            : period === "month"
              ? "Month to date"
              : "Dates inclusive"}
        </p>
      </div>
      <SummaryCards
        items={[
          { label: "Sales revenue", value: money(summary.total) },
          {
            label: "Gross profit",
            value:
              summary.grossProfit === null
                ? "Incomplete"
                : money(summary.grossProfit),
            hint: "Revenue minus product costs",
            detail: `Gross margin · ${margin(summary.grossMargin)}`,
          },
          {
            label: "Net profit",
            value:
              summary.netProfit === null
                ? "Incomplete"
                : money(summary.netProfit),
            hint: "Gross profit minus recorded expenses",
            detail: `Net margin · ${margin(summary.netMargin)}`,
          },
        ]}
      />
      <p className="hint mb-6">
        {summary.orders} completed sales · Average {money(summary.average)} ·
        Product costs {money(summary.productCosts)}
        {summary.missingCosts > 0 && " (known costs only)"} · Expenses{" "}
        {money(summary.operatingExpenses)} · Cash {money(summary.cash)} · Wallet{" "}
        {money(summary.wallet)} ·{" "}
        {sales.filter((s) => s.status !== "completed").length} reversed sales
      </p>
      {summary.missingCosts > 0 && (
        <p role="status" className="form-message error">
          Profit is incomplete: {summary.missingCosts} sale(s) have no saved
          product cost.{" "}
          {founder
            ? "Open each affected receipt and choose Record missing cost. Set product costs in POS for future sales."
            : "Ask the owner to record the missing cost on each affected receipt."}
        </p>
      )}
      <p className="hint mb-6">
        Refunds reduce revenue; prepared product costs remain deducted.
        Cancelled sales are excluded. Net profit includes only recorded costs
        and expenses.
      </p>
      <Expenses
        expenses={expenses}
        shopId={shopId}
        founder={founder}
        today={today}
      />
      <Card>
        <CardHeader
          title="Sales history"
          description="Open a receipt to see its items, payment and refund status."
        />
        <DataTable
          caption="Sales history"
          searchPlaceholder="Search receipt or payment method"
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
              method: s.method,
              total: money(s.total_cents),
              status: (
                <>
                  <span className="status">{s.status}</span>
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
    </>
  );
}
