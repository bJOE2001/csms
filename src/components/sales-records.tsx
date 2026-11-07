"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Sale } from "@/lib/sales/domain";
import { money, paymentMethodLabel } from "@/lib/sales/domain";
import { DataTable } from "./ui/data-table";
import { Card } from "./ui/card";
import { ReceiptDialog } from "./receipt-dialog";
import { ReceiptPrint } from "./receipt-print";
import type { CustomerReceipt, ReceiptBusinessDetails, ReceiptPaperWidth } from "@/lib/sales/receipt";

export function SalesRecords({ sales, shopId, shopName, timezone, founder, from, to, recent = false, actions, business }: {
  sales: Sale[]; shopId: string; shopName: string; timezone: string; founder: boolean;
  from: string; to: string; recent?: boolean; actions?: ReactNode;
  business?: ReceiptBusinessDetails;
}) {
  const [print, setPrint] = useState<{ receipt: CustomerReceipt; paperWidth: ReceiptPaperWidth }>();
  const closePrint = useCallback(() => setPrint(undefined), []);
  const [linkedReceipt, setLinkedReceipt] = useState<string>();
  useEffect(() => {
    const readLink = () => {
      const match = /^#receipt-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(window.location.hash);
      setLinkedReceipt(!recent && match ? match[1].toLowerCase() : undefined);
    };
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, [from, to, recent]);
  // Resolve only against the existing, authorized reporting response. Pagination
  // does not prevent opening a linked receipt and no additional reader is added.
  const linkedSale = linkedReceipt ? sales.find(sale => sale.id.toLowerCase() === linkedReceipt) : undefined;
  const closeLinkedReceipt = () => {
    setLinkedReceipt(undefined);
    closePrint();
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  };
  return <>
      {linkedReceipt && !linkedSale && <p role="status" className="hint">This receipt is unavailable in the selected reporting period or for your current access.</p>}
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
            search: `${s.id} ${s.method} ${paymentMethodLabel(s.method)} ${s.status}`,
            cells: {
              receipt: <strong className="table-receipt-number">#{s.id.slice(0, 8).toUpperCase()}</strong>,
              date: new Intl.DateTimeFormat("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: timezone,
              }).format(new Date(s.created_at)),
              method: paymentMethodLabel(s.method),
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
                  onPrint={(receipt, paperWidth) => setPrint({ receipt, paperWidth })}
                  printing={print?.receipt.reference === s.id}
                  onCancelPrint={closePrint}
                  business={business}
                  tableAction
                />
              ),
            },
          }))}
        />
      </Card>
      {linkedSale && <ReceiptDialog key={linkedSale.id} sale={linkedSale} shopId={shopId} shopName={shopName} timezone={timezone} founder={founder}
        initialOpen hideTrigger onPrint={(receipt, paperWidth) => setPrint({ receipt, paperWidth })}
        printing={print?.receipt.reference === linkedSale.id} onCancelPrint={closeLinkedReceipt} business={business} />}
      {print && (
        <ReceiptPrint
          receipt={print.receipt}
          paperWidth={print.paperWidth}
          business={business}
          shopName={shopName}
          onClose={closePrint}
        />
      )}
  </>;
}
