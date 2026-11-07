"use client";

import { useId, type ReactElement } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ChevronDown, Pencil, SlidersHorizontal } from "lucide-react";
import { displayQuantity, formatUnitCost, itemTypes, stockStatus, type InventoryItem } from "@/lib/inventory/domain";
import { money } from "@/lib/sales/domain";
import { AppFormDialog } from "../ui/app-form-dialog";
import { Button } from "../ui/button";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { StockWorkflow } from "./stock-dialog";

export function InventoryStatus({ item }: { item: InventoryItem }) {
  const status = stockStatus(item);
  const tone = status === "In Stock" ? "ok" : status === "Low Stock" ? "low" : status === "Out of Stock" ? "out" : "inactive";
  return <span className={`menu-status inventory-status-${tone}`}>{status}</span>;
}

function ActionHint({ description, children }: { description: string; children: ReactElement }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className="table-action-tooltip" side="top" sideOffset={6} collisionPadding={12}>{description}</Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root>;
}

export function ItemDetails({ item, onClose, onStock, onHistory, onEdit }: {
  item: InventoryItem;
  onClose: () => void;
  onStock: (workflow: StockWorkflow) => void;
  onHistory: () => void;
  onEdit: () => void;
}) {
  const helpId = useId();
  return (
    <Tooltip.Provider delayDuration={350}>
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
        <div className="inventory-detail-actions" aria-label="Additional item actions">
          <ActionHint description="Review all recorded stock movements for this item."><Button variant="link" onClick={onHistory}>View History</Button></ActionHint>
          <Popover>
            <PopoverTrigger asChild><Button variant="ghost">More Actions <ChevronDown size={16} aria-hidden="true" /></Button></PopoverTrigger>
            <PopoverContent className="inventory-actions-popover" side="top" align="end" aria-label={`More actions for ${item.name}`}>
              <PopoverClose asChild><button type="button" className="inventory-menu-item" aria-label="Adjust Stock" aria-describedby={`${helpId}-adjust`} disabled={!item.active} onClick={()=>onStock("correction")}>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span><strong>Adjust Stock</strong><small id={`${helpId}-adjust`}>Record wastage, damage, spoilage, or stock corrections.</small></span>
              </button></PopoverClose>
              <PopoverClose asChild><button type="button" className="inventory-menu-item" aria-label={`Edit inventory item ${item.name}`} aria-describedby={`${helpId}-edit`} onClick={onEdit}>
                <Pencil size={18} aria-hidden="true" />
                <span><strong>Edit Item</strong><small id={`${helpId}-edit`}>Update item information without changing stock quantities.</small></span>
              </button></PopoverClose>
            </PopoverContent>
          </Popover>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" data-dialog-cancel onClick={onClose}>Close</Button>
        <ActionHint description="Enter the actual quantity you physically counted."><Button variant="outline" disabled={!item.active} onClick={() => onStock("count")}>Count Stock</Button></ActionHint>
        <ActionHint description="Add newly purchased or received inventory."><Button disabled={!item.active} onClick={() => onStock("receipt")}>Stock In</Button></ActionHint>
      </DialogFooter>
    </AppFormDialog>
    </Tooltip.Provider>
  );
}
