"use client";

import { useId, useRef, useState } from "react";
import { ClipboardCheck, Ellipsis, Eye, PackagePlus, Pencil, SlidersHorizontal } from "lucide-react";
import type { InventoryItem } from "@/lib/inventory/domain";
import { TableActionButton } from "../ui/table-action-button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { StockWorkflow } from "./stock-dialog";

export function ItemRowActions({ item, onStock, onEdit, onViewDetails, allowStock = true, allowEdit = true }: {
  item: InventoryItem;
  allowStock?: boolean;
  allowEdit?: boolean;
  onStock: (workflow: StockWorkflow, trigger: HTMLButtonElement | null) => void;
  onEdit: (trigger: HTMLButtonElement | null) => void;
  onViewDetails: (trigger: HTMLButtonElement | null) => void;
}) {
  const helpId = useId();
  const stock = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const [open, setOpen] = useState(false);
  const selectAction = (action: () => void) => {
    openingDialog.current = true;
    setOpen(false);
    action();
  };
  return (
    <div className="table-actions" data-row-action role="group" aria-label={`Actions for ${item.name}`}>
      {allowStock && <TableActionButton ref={stock} icon={PackagePlus} label={`Stock In for ${item.name}`} tooltip="Stock In" disabled={!item.active}
        onClick={() => onStock("receipt", stock.current)} />}
      <Popover open={open} onOpenChange={next => { if (next) openingDialog.current = false; setOpen(next); }}>
        <PopoverTrigger asChild>
          <TableActionButton ref={more} icon={Ellipsis} label={`More actions for ${item.name}`} tooltip="More Actions" />
        </PopoverTrigger>
        <PopoverContent className="inventory-actions-popover" side="bottom" align="end" aria-label={`More actions for ${item.name}`}
          onCloseAutoFocus={event => { if (openingDialog.current) event.preventDefault(); }}>
          {allowStock && <button type="button" className="inventory-menu-item" aria-label={`Count Stock for ${item.name}`}
            aria-describedby={`${helpId}-count`} disabled={!item.active} onClick={() => selectAction(() => onStock("count", more.current))}>
            <ClipboardCheck size={18} aria-hidden="true" />
            <span><strong>Count Stock</strong><small id={`${helpId}-count`}>Enter your actual physical count.</small></span>
          </button>}
          {allowStock && <button type="button" className="inventory-menu-item" aria-label={`Adjust Stock for ${item.name}`}
            aria-describedby={`${helpId}-adjust`} disabled={!item.active} onClick={() => selectAction(() => onStock("correction", more.current))}>
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span><strong>Adjust Stock</strong><small id={`${helpId}-adjust`}>Record damage, wastage, or corrections.</small></span>
          </button>}
          {allowEdit && <button type="button" className="inventory-menu-item" aria-label={`Edit inventory item ${item.name}`}
            aria-describedby={`${helpId}-edit`} onClick={() => selectAction(() => onEdit(more.current))}>
            <Pencil size={18} aria-hidden="true" />
            <span><strong>Edit Item</strong><small id={`${helpId}-edit`}>Update item information without changing stock quantities.</small></span>
          </button>}
          <button type="button" className="inventory-menu-item" aria-label={`View details for ${item.name}`}
            aria-describedby={`${helpId}-details`} onClick={() => selectAction(() => onViewDetails(more.current))}>
            <Eye size={18} aria-hidden="true" />
            <span><strong>View Item Details</strong><small id={`${helpId}-details`}>Inspect stock valuation, thresholds, and usage.</small></span>
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
