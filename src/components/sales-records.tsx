"use client";
import { useCallback, useState, type ReactNode } from "react";
import type { Sale } from "@/lib/sales/domain";
import { money } from "@/lib/sales/domain";
import { DataTable } from "./ui/data-table";
import { Card } from "./ui/card";
import { ReceiptDialog } from "./receipt-dialog";
import { ReceiptPrint } from "./receipt-print";

export function SalesRecords({ sales, shopId, shopName, timezone, founder, from, to, recent = false, actions }: {
  sales: Sale[]; shopId: string; shopName: string; timezone: string; founder: boolean;
  from: string; to: string; recent?: boolean; actions?: ReactNode;
}) {
  const [print, setPrint] = useState<string>();
  const closePrint = useCallback(() => setPrint(undefined), []);
  const printSale = sales.find(sale => sale.id === print);
  return <>
      <Card className="sales-section sales-history">
        <DataTable
          searchable={!recent}
          paginate={!recent}
          actions={actions}
          paginationResetKey={`${from}:${to}`}
          toolbarLeading={
            <div className="sales-section-heading">
              <h2>{recent ? "Recent Transactions" : "Sales History"}</h2>
              <p className="hint">
                {recent ? "Latest five transactions in the selected period." : "View transactions and payment details."}
              </p>
            </div>
          }
          caption={recent ? "Recent transactions" : "Sales history"}
          searchPlaceholder="Search receipt or payment method"
          emptyMessage="No sales records found for the selected period."
          columns={[
            { key: "receipt", label: "Receipt", kind: "primary" },
            { key: "date", label: "Date", kind: "compact" },
            { key: "method", label: "Payment", kind: "compact" },
            { key: "total", label: "Total", numeric: true },
            { key: "status", label: "Status", kind: "status" },
            { key: "actions", label: "Actions", kind: "actions" },
          ]}
          rows={sales.map((s) => ({
            id: s.id,
            search: `${s.id} ${s.method} ${s.status}`,
            cells: {
              receipt: <strong className="table-receipt-number">#{s.id.slice(0, 8).toUpperCase()}</strong>,
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
                  tableAction
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
  </>;
}
