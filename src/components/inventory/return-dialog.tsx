"use client";

import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { AppFormDialog } from "../ui/app-form-dialog";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { displayQuantity, returnSchema, type Returnable } from "@/lib/inventory/domain";
import { saveInventory } from "@/lib/inventory/client";
import { InventoryConfirm } from "./inventory-confirm";
import { notify } from "@/lib/notify";

export function ReturnStockDialog({ entries, refresh }: { entries: Returnable[]; refresh: () => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" disabled={!entries.length} onClick={() => setOpen(true)}>
        Return Finished Goods
      </Button>
      {open && entries.length > 0 && (
        <ReturnEditor entries={entries} refresh={refresh} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function ReturnEditor({
  entries,
  refresh,
  onClose,
}: {
  entries: Returnable[];
  refresh: () => Promise<unknown>;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState(entries[0]);
  const [review, setReview] = useState<ReturnType<typeof returnSchema.parse>>();
  const [error, setError] = useState("");
  const operation = useRef(crypto.randomUUID());

  return (
    <AppFormDialog
      open
      onClose={onClose}
      title="Return Finished Goods"
      description="Restore unopened, reusable finished goods from a refunded receipt. Prepared drink ingredients are never restored automatically."
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
            Refunded receipt item
            <Select
              value={entry.id}
              onValueChange={id => setEntry(entries.find(row => row.id === id)!)}
              options={entries.map(row => ({
                value: row.id,
                label: `#${row.receipt} · ${row.ingredient_name}`,
              }))}
            />
          </label>
          <p className="hint">
            Remaining returnable quantity: <strong>{displayQuantity(entry.remaining_quantity, entry.base_unit)}</strong>.
          </p>
          <label className="field">
            Return quantity
            <Input name="quantity" required inputMode="decimal" />
          </label>
          <label className="field">
            Return reason
            <Input
              name="reason"
              required
              maxLength={500}
              placeholder="Confirm that the goods are unopened and reusable"
            />
          </label>
          <p className="hint">
            Restoring stock records a product-cost credit on the return date while keeping the original receipt snapshot intact.
          </p>
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
