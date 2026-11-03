"use client";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { money, type Sale } from "@/lib/sales/domain";
import { FormDialog } from "./ui/form-dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/primitives/input";
import { Icon } from "./ui/icon";
import { MutationForm } from "./mutation-form";
import { RecordSaleCost } from "./record-sale-cost";
import { SaleReceipt } from "./sale-receipt";

export function ReceiptDialog({
  sale: s,
  shopId,
  shopName,
  timezone,
  founder,
  onPrint,
  tableAction = false,
}: {
  sale: Sale;
  shopId: string;
  shopName: string;
  timezone: string;
  founder: boolean;
  onPrint: () => void;
  tableAction?: boolean;
}) {
  const router = useRouter();
  return (
    <FormDialog
      trigger={`#${s.id.slice(0, 8).toUpperCase()}`}
      triggerLabel={`View receipt ${s.id.slice(0, 8).toUpperCase()}`}
      tableAction={tableAction ? { icon: Eye, tooltip: "View receipt" } : undefined}
      title="Sale receipt"
      readOnly
      className="receipt-dialog"
      readOnlyActions={
        <Button onClick={onPrint}>
          <Icon name="print" size={18} />
          Print receipt
        </Button>
      }
    >
      <SaleReceipt sale={s} shopName={shopName} timezone={timezone} />
      <section className="receipt-business" aria-label="Business details">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3>Business details</h3>
          <span className="receipt-label">Not printed</span>
        </div>
        <dl className="mt-4">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <dt>Preparation cost</dt>
            <dd className="font-semibold tabular-nums">
              {s.total_cost_cents == null
                ? "Not recorded"
                : money(s.total_cost_cents)}
            </dd>
          </div>
        </dl>
        {s.cost_note && (
          <p className="hint mt-3 break-words">Cost source: {s.cost_note}</p>
        )}
        {s.cost_recorded_at && (
          <p className="hint mt-2">
            Recorded by owner ·{" "}
            {new Intl.DateTimeFormat("en-PH", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: timezone,
            }).format(new Date(s.cost_recorded_at))}
          </p>
        )}
        {founder &&
          s.total_cost_cents == null &&
          (s.status === "completed" || s.status === "refunded") && (
            <div className="mt-3">
              <RecordSaleCost saleId={s.id} shopId={shopId} />
            </div>
          )}
        {s.refund_reason && (
          <p className="hint mt-3 break-words">
            Refund reason: {s.refund_reason}
          </p>
        )}
        {founder && s.status === "completed" && (
          <div className="receipt-management">
            <p className="hint">
              Return the payment to the customer before recording a full refund.
            </p>
            <FormDialog
              trigger="Refund sale"
              triggerClassName="secondary danger"
              title="Refund this sale?"
              description="Confirm after returning the full payment to the customer. The original receipt stays in history."
              confirmation
              danger
            >
              <MutationForm
                submitLabel="Confirm refund"
                action={async (_previous, form) => {
                  try {
                    const response = await fetch("/api/pos", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "refund",
                        shop_id: shopId,
                        data: {
                          id: s.id,
                          reason: String(form.get("reason")),
                        },
                      }),
                    });
                    const result = await response.json();
                    if (!response.ok) throw Error(result.error);
                    router.refresh();
                    return {
                      status: "success",
                      message: "Sale refunded.",
                    };
                  } catch (e) {
                    return {
                      status: "error",
                      message:
                        e instanceof Error ? e.message : "Refund failed.",
                    };
                  }
                }}
              >
                <label className="field">
                  Reason
                  <Input name="reason" required maxLength={500} />
                </label>
              </MutationForm>
            </FormDialog>
          </div>
        )}
      </section>
    </FormDialog>
  );
}
