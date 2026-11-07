"use client";

import { useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { FormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { decimal, scaled, isBaseUnitLocked, itemSchema, units, itemTypes, type InventoryItem } from "@/lib/inventory/domain";
import { cents } from "@/lib/sales/domain";
import { shopDate } from "@/lib/sales/period";
import { saveInventory } from "@/lib/inventory/client";

export function InventoryItemDialog({
  item,
  refresh,
  triggerLabelText,
  triggerClassName,
  initialOpen = false,
  hideTrigger = false,
  onClose,
}: {
  item?: InventoryItem;
  refresh: () => Promise<unknown>;
  triggerLabelText?: string;
  triggerClassName?: string;
  initialOpen?: boolean;
  hideTrigger?: boolean;
  onClose?: () => void;
}) {
  const id = useRef(item?.id ?? crypto.randomUUID());
  const helpId = useId();
  const [selectedType, setSelectedType] = useState<InventoryItem["item_type"]>(item?.item_type ?? "ingredient");
  const unitLocked = isBaseUnitLocked(item);
  const activeTypeInfo = itemTypes.find(entry => entry.value === selectedType);

  return (
    <FormDialog
      trigger={item && !triggerLabelText ? null : triggerLabelText ?? "Add Inventory Item"}
      triggerLabel={item ? `Edit inventory item ${item.name}` : undefined}
      triggerClassName={triggerClassName ?? (item ? "secondary compact" : "accent")}
      tableAction={item && !triggerLabelText ? { icon: Pencil, tooltip: "Edit Item" } : undefined}
      initialOpen={initialOpen}
      hideTrigger={hideTrigger}
      onClose={onClose}
      title={item ? "Edit Inventory Item" : "Add Inventory Item"}
      description={item ? "Update item details while preserving its stock history." : "Add an ingredient, packaging supply, or finished good."}
      className="inventory-item-dialog"
    >
      <MutationForm
        submitLabel={item ? "Save changes" : "Save item"}
        action={async (_previous, form) => {
          const parsed = itemSchema.safeParse({
            id: id.current,
            name: form.get("name"),
            item_type: form.get("item_type") ?? selectedType,
            base_unit: form.get("base_unit") ?? item?.base_unit,
            minimum_stock: form.get("minimum_stock") || "0",
            notes: form.get("notes") || "",
            active: form.get("active") === "on",
          });
          if (!parsed.success) {
            return { status: "error", validation: true, message: parsed.error.issues[0].message };
          }
          if (!!String(form.get("initial_quantity")??"").trim() !== !!String(form.get("initial_value")??"").trim()) return {status:"error",validation:true,message:"Enter both initial quantity and total value, or leave both blank."};
          try {
            await saveInventory("item", {...parsed.data,...(String(form.get("initial_quantity")??"").trim()?{initial_stock:{operation_id:id.current,quantity:String(form.get("initial_quantity")),total_cost_cents:cents(String(form.get("initial_value"))),occurred_on:shopDate("Asia/Manila")}}:{})});
            await refresh();
            return { status: "success", message: item ? "Inventory item updated." : "Inventory item created." };
          } catch (error) {
            return {
              status: "error",
              message: error instanceof Error ? error.message : "Item could not be saved.",
            };
          }
        }}
      >
        <fieldset className="inventory-form-section">
          <legend>Item Information</legend>
          <label className="field">
            Item name
            <Input
              name="name"
              defaultValue={item?.name}
              placeholder="e.g., Ground Coffee, Fresh Milk, 16 oz Cold Cup"
              required
              maxLength={120}
            />
          </label>
          <label className="field">
            Item type
            <Select
              name="item_type"
              value={selectedType}
              onValueChange={value => setSelectedType(value as InventoryItem["item_type"])}
              options={itemTypes.map(({ value, label }) => ({ value, label }))}
            />
          </label>
          {activeTypeInfo && <p className="hint">{activeTypeInfo.description}</p>}
        </fieldset>

        <fieldset className="inventory-form-section">
          <legend>Measurement</legend>
          <div className="inventory-form-grid">
            <label className="field">
              Base unit
              <Select
                name="base_unit"
                defaultValue={item?.base_unit ?? (selectedType === "ingredient" ? "g" : "each")}
                options={[...units]}
                disabled={unitLocked}
              />
            </label>
            <label className="field">
              Low-stock threshold
              <Input
                aria-describedby={`${helpId}-threshold`}
                name="minimum_stock"
                inputMode="decimal"
                defaultValue={item ? decimal(scaled(String(item.minimum_stock))) : "0"}
                required
              />
            </label>
          </div>
          <p className="hint">
            {unitLocked
              ? "Base unit is locked because stock movements or product recipes already reference this item."
              : "Use the base unit you track. Stock In converts kilograms and liters automatically."}
          </p>
          <p id={`${helpId}-threshold`} className="hint">
            Show a warning when available quantity reaches this amount.
          </p>
        </fieldset>

        {!item && <details className="inventory-advanced-details"><summary>Initial Stock</summary><p className="hint">Optional: enter the stock you already have.</p><div className="inventory-form-grid"><label className="field">Initial Quantity<Input name="initial_quantity" inputMode="decimal"/></label><label className="field">Total Initial Stock Value (PHP)<Input name="initial_value" inputMode="decimal"/></label></div></details>}
        <fieldset className="inventory-form-section">
          <legend>Additional Details</legend>
          <label className="field">
            Notes (optional)
            <textarea
              name="notes"
              defaultValue={item?.notes}
              placeholder="Optional storage note, brand, or supplier specification"
              maxLength={1000}
              rows={2}
            />
          </label>
          <label className="menu-checkbox">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
            Active inventory item
          </label>
          {item && (
            <p className="hint">
              Uncheck to retire an unused item while keeping its historical records intact. Products with active recipes using an inactive item pause until updated.
            </p>
          )}
        </fieldset>
      </MutationForm>
    </FormDialog>
  );
}
