"use client";

import { useRef, useState, type RefObject } from "react";
import { Button } from "../ui/button";
import { AppFormDialog } from "../ui/app-form-dialog";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { displayQuantity, returnSchema, scaled, type Returnable } from "@/lib/inventory/domain";
import { saveInventory } from "@/lib/inventory/client";
import { InventoryConfirm } from "./inventory-confirm";
import { notify } from "@/lib/notify";

const receiptKey = (entry: Returnable) => entry.sale_id ?? entry.receipt;

export function ReturnStockDialog({
  entries,
  refresh,
  onClose,
  returnFocusRef,
}: {
  entries: Returnable[];
  refresh: () => Promise<unknown>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [entry, setEntry] = useState(entries[0]);
  const [review, setReview] = useState<ReturnType<typeof returnSchema.parse>>();
  const [error, setError] = useState("");
  const operation = useRef(crypto.randomUUID());
  const receipts = Array.from(new Map(entries.map(row => [receiptKey(row), row])).values());
  const receiptItems = entries.filter(row => receiptKey(row) === receiptKey(entry));

  return (
    <AppFormDialog
      open
      onClose={onClose}
      title="Return to Stock"
      description="Only unopened, reusable finished goods can be returned."
      returnFocusRef={returnFocusRef}
    >
      <form
        className="dialog-form"
        onSubmit={event => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const parsed = returnSchema.safeParse({
            operation_id: operation.current,
            consumption_id: entry.id,
            quantity: form.get("quantity"),
            reason: form.get("reason"),
          });
          if (parsed.success) {
            const quantity = scaled(parsed.data.quantity);
            if (quantity > scaled(String(entry.remaining_quantity))) {
              setError("Return quantity exceeds the remaining returnable quantity.");
              return;
            }
            if (entry.base_unit === "each" && quantity % 1_000_000n !== 0n) {
              setError("Enter a whole number of pieces.");
              return;
            }
            setError("");
            setReview(parsed.data);
          } else {
            setError("Check the return quantity and reason.");
          }
        }}
      >
        <DialogBody className="inventory-form-body">
          {error && (
            <p role="alert" className="form-message error">
              {error}
            </p>
          )}
          <label className="field">
            Refunded receipt
            <Select
              value={receiptKey(entry)}
              onValueChange={id => { setEntry(entries.find(row => receiptKey(row) === id)!); setError(""); }}
              options={receipts.map(row => ({
                value: receiptKey(row),
                label: `#${row.receipt}${receipts.filter(other => other.receipt === row.receipt).length > 1 ? ` · …${receiptKey(row).slice(-8)}` : ""}`,
              }))}
            />
          </label>
          <label className="field">
            Finished good
            <Select
              value={entry.id}
              onValueChange={id => { setEntry(entries.find(row => row.id === id)!); setError(""); }}
              options={receiptItems.map(row => ({
                value: row.id,
                label: row.ingredient_name,
              }))}
            />
          </label>
          <p className="hint">
            Remaining returnable quantity: <strong>{displayQuantity(entry.remaining_quantity, entry.base_unit)}</strong>.
          </p>
          <label className="field">
            Return quantity
            <Input key={entry.id} name="quantity" required inputMode="decimal" />
          </label>
          <label className="field">
            Return reason
            <Input
              name="reason"
              required
              maxLength={500}
            />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" data-dialog-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Review Return</Button>
        </DialogFooter>
      </form>
      {review && (
        <InventoryConfirm
          title="Return Finished Goods to Stock?"
          summaryRows={[
            { label: "Inventory Item", value: entry.ingredient_name },
            { label: "Refunded Receipt", value: `#${entry.receipt}` },
            { label: "Quantity Returned", value: displayQuantity(review.quantity, entry.base_unit) },
            { label: "Reason", value: review.reason },
          ]}
          confirmLabel="Confirm Return"
          onClose={() => setReview(undefined)}
          onConfirm={async () => {
            await saveInventory("return", review);
            await refresh();
            notify.success("Finished goods returned to stock");
            onClose();
          }}
        />
      )}
    </AppFormDialog>
  );
}
