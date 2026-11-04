"use client";
import { useRouter } from "next/navigation";
import { useLoadingTransition } from "./ui/global-loading-bar";
import { cents } from "@/lib/sales/domain";
import { FormDialog } from "./ui/form-dialog";
import { MutationForm } from "./mutation-form";
import { Input } from "./ui/primitives/input";

export function RecordSaleCost({
  saleId,
  shopId,
}: {
  saleId: string;
  shopId: string;
}) {
  const router = useRouter();
  const startRefresh = useLoadingTransition();
  return (
    <FormDialog
      trigger="Record missing cost"
      title="Record missing cost"
      description="Enter the actual preparation cost for every item and quantity on this receipt. This updates profit for the original sale date, including refunded sales. The saved amount cannot be overwritten."
    >
      <MutationForm
        errorTitle="Failed to record preparation cost"
        submitLabel="Save preparation cost"
        action={async (_previous, form) => {
          try {
            const response = await fetch("/api/pos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "record_cost",
                shop_id: shopId,
                data: {
                  id: saleId,
                  cost_cents: cents(String(form.get("cost"))),
                  note: String(form.get("note")),
                },
              }),
            });
            const result = await response.json();
            if (!response.ok) throw Error(result.error);
            startRefresh(() => router.refresh());
            return {
              status: "success",
              message: "Preparation cost recorded. Profit has been updated.",
            };
          } catch (error) {
            return {
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "The cost could not be saved. Retry the same entry.",
            };
          }
        }}
      >
        <label className="field">
          Total preparation cost (PHP)
          <Input
            name="cost"
            inputMode="decimal"
            required
            aria-describedby="historical-cost-help"
          />
          <small id="historical-cost-help" className="hint">
            Ingredients, packaging and other direct costs for the whole receipt.
            Enter 0 only if nothing was prepared or consumed. Do not enter the
            selling price or refund amount.
          </small>
        </label>
        <label className="field">
          Cost source / note
          <Input
            name="note"
            required
            maxLength={500}
            placeholder="For example, 2 drinks × PHP 35, from ingredient records"
          />
        </label>
      </MutationForm>
    </FormDialog>
  );
}
