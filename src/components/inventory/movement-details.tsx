"use client";

import { displayQuantity, signedQuantity, type Movement } from "@/lib/inventory/domain";
import { money } from "@/lib/sales/domain";
import { LoadingLink } from "../ui/loading-link";
import { AppFormDialog } from "../ui/app-form-dialog";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { Button } from "../ui/button";

export const movementLabels: Record<string, string> = {
  opening: "Initial Stock", receipt: "Stock In", sale: "Sale Consumption",
  count: "Stock Count Correction", correction: "Stock Adjustment", waste: "Wastage", return: "Finished-Good Return",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function movementReference(movement: Movement) {
  if (movement.kind === "sale") return `Receipt #${movement.source_id.slice(0, 8).toUpperCase()}`;
  if (movement.reference) return uuid.test(movement.reference) ? `Reference #${movement.reference.slice(0, 8).toUpperCase()}` : movement.reference;
  return movement.kind === "return" ? "Finished-good return" : "—";
}

export function MovementDetails({ movement, onClose }: { movement: Movement; onClose: () => void }) {
  const kind = movementLabels[movement.kind] ?? movement.kind;
  const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${movement.occurred_on}T00:00:00Z`));
  const recorded = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(movement.created_at));
  const receiptHref = movement.kind === "sale" && uuid.test(movement.source_id)
    ? `/app/sales?from=${movement.occurred_on}&to=${movement.occurred_on}#receipt-${movement.source_id}` : undefined;
  return <AppFormDialog open showCloseButton title="Stock Movement Details" description={`${kind} · ${date}`} onClose={onClose}>
    <DialogBody className="inventory-movement-details">
      <dl className="inventory-detail-list">
        <div><dt>Inventory Item</dt><dd>{movement.name}</dd></div>
        <div><dt>Movement Type</dt><dd><span className="menu-status">{kind}</span></dd></div>
        <div><dt>Movement Date</dt><dd>{date}</dd></div>
        <div><dt>Date and Time Recorded</dt><dd>{recorded}</dd></div>
        <div><dt>Quantity Change</dt><dd className={Number(movement.quantity_delta) < 0 ? "inventory-quantity-decrease" : "inventory-quantity-increase"}>{signedQuantity(movement.quantity_delta, movement.base_unit)}</dd></div>
        {movement.previous_quantity != null && <div><dt>Balance Before</dt><dd>{displayQuantity(movement.previous_quantity, movement.base_unit)}</dd></div>}
        <div><dt>Balance After</dt><dd>{movement.resulting_quantity == null ? "Not recorded" : displayQuantity(movement.resulting_quantity, movement.base_unit)}</dd></div>
        <div><dt>Cost Change</dt><dd>{movement.value_delta_cents == null ? "Not recorded" : money(movement.value_delta_cents)}</dd></div>
        <div><dt>Reason</dt><dd>{movement.reason || "Not recorded"}</dd></div>
        {movement.notes && <div><dt>Notes</dt><dd>{movement.notes}</dd></div>}
        {movement.supplier && <div><dt>Supplier</dt><dd>{movement.supplier}</dd></div>}
        <div><dt>Related Reference</dt><dd>{movementReference(movement)}</dd></div>
      </dl>
      <details className="inventory-advanced-details">
        <summary>Advanced Details</summary>
        <dl className="inventory-detail-list inventory-technical-details">
          <div><dt>Movement ID</dt><dd>{movement.id}</dd></div>
          <div><dt>Source ID</dt><dd>{movement.source_id}</dd></div>
          <div><dt>Recorded By</dt><dd>{movement.created_by}</dd></div>
          <div><dt>Inventory Item ID</dt><dd>{movement.ingredient_id}</dd></div>
          <div><dt>Recorded Timestamp</dt><dd>{movement.created_at}</dd></div>
          {movement.reference && <div><dt>Original Reference</dt><dd>{movement.reference}</dd></div>}
          {movement.purchase_unit && movement.entered_quantity != null && <div><dt>Original Entry</dt><dd>{displayQuantity(movement.entered_quantity, movement.purchase_unit)}</dd></div>}
        </dl>
      </details>
    </DialogBody>
    {receiptHref && <DialogFooter>
      <Button asChild><LoadingLink href={receiptHref}>View Receipt</LoadingLink></Button>
    </DialogFooter>}
  </AppFormDialog>;
}
