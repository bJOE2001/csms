"use client";

import { displayQuantity, formatUnitCost, itemTypes, stockStatus, type InventoryItem } from "@/lib/inventory/domain";
import { money } from "@/lib/sales/domain";
import { AppFormDialog } from "../ui/app-form-dialog";
import { Button } from "../ui/button";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";

export function InventoryStatus({ item }: { item: InventoryItem }) {
  const status = stockStatus(item);
  const tone = status === "In Stock" ? "ok" : status === "Low Stock" ? "low" : status === "Out of Stock" ? "out" : "inactive";
  return <span className={`menu-status inventory-status-${tone}`}>{status}</span>;
}

export function ItemDetails({ item, onClose }: {
  item: InventoryItem;
  onClose: () => void;
}) {
  return (
    <AppFormDialog open title={item.name} description={itemTypes.find(type => type.value === item.item_type)?.label} onClose={onClose} size="sm">
      <DialogBody className="inventory-item-details">
        <dl className="inventory-detail-overview">
          <div><dt>Available Stock</dt><dd>{displayQuantity(item.quantity, item.base_unit)}</dd></div>
          <div><dt>Status</dt><dd><InventoryStatus item={item} /></dd></div>
        </dl>
        <dl className="inventory-detail-list">
          <div><dt>Average Unit Cost</dt><dd>{formatUnitCost(item.unit_cost_cents)}</dd></div>
          <div><dt>Stock Value</dt><dd>{item.value_cents === null ? "Incomplete" : money(item.value_cents)}</dd></div>
          <div><dt>Low-Stock Threshold</dt><dd>{displayQuantity(item.minimum_stock, item.base_unit)}</dd></div>
        </dl>
        {item.notes && <p className="hint inventory-item-notes">{item.notes}</p>}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" data-dialog-cancel onClick={onClose}>Close</Button>
      </DialogFooter>
    </AppFormDialog>
  );
}
