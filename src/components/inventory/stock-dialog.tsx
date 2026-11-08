"use client";

import { useRef, useState, type RefObject } from "react";
import { PackagePlus } from "lucide-react";
import { Button } from "../ui/button";
import { TableActionButton } from "../ui/table-action-button";
import { AppFormDialog } from "../ui/app-form-dialog";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { DatePicker } from "../ui/date-picker";
import {
  canSetOpeningStock,
  decimal,
  displayQuantity,
  formatUnitCost,
  scaled,
  signedQuantity,
  stockSchema,
  unitLabel,
  type InventoryItem,
} from "@/lib/inventory/domain";
import { saveInventory } from "@/lib/inventory/client";
import { cents, money } from "@/lib/sales/domain";
import { InventoryConfirm, type ReviewRow } from "./inventory-confirm";
import { notify } from "@/lib/notify";

export type StockWorkflow = "opening" | "receipt" | "count" | "correction";

type AdjustmentSubtype = "wastage" | "spoilage" | "damaged" | "decrease" | "increase";

const adjustmentOptions: ReadonlyArray<{ value: AdjustmentSubtype; label: string; defaultReason: string }> = [
  { value: "wastage", label: "Wastage / Spillage", defaultReason: "Wastage / spillage" },
  { value: "spoilage", label: "Spoilage / Expired", defaultReason: "Spoilage / expired stock" },
  { value: "damaged", label: "Damaged Supplies", defaultReason: "Damaged supplies" },
  { value: "decrease", label: "Decrease Stock (Correction)", defaultReason: "" },
  { value: "increase", label: "Increase Stock (Correction)", defaultReason: "" },
];

export function StockDialog({
  items,
  item,
  today,
  workflow = "receipt",
  triggerVariant = "outline",
  triggerClassName,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
  refresh,
  returnFocusRef,
}: {
  items: InventoryItem[];
  item?: InventoryItem;
  today: string;
  workflow?: StockWorkflow;
  triggerVariant?: "default" | "outline" | "ghost";
  triggerClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  refresh: () => Promise<unknown>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  const eligibleItems =
    workflow === "opening"
      ? items.filter(row => (item && row.id === item.id ? row.active : canSetOpeningStock(row)))
      : items.filter(row => row.active);

  const label =
    workflow === "opening"
      ? "Set Opening Stock"
      : workflow === "count"
        ? "Count Stock"
        : workflow === "correction"
          ? "Adjust Stock"
          : "Stock In";

  return (
    <>
      {!hideTrigger &&
        (item && !workflow ? (
          <TableActionButton
            icon={PackagePlus}
            label={`Record stock for ${item.name}`}
            onClick={() => setOpen(true)}
            disabled={!item.active}
          />
        ) : (
          <Button
            variant={triggerVariant}
            className={triggerClassName}
            disabled={item ? !item.active || (workflow === "opening" && !canSetOpeningStock(item)) : eligibleItems.length === 0}
            onClick={() => setOpen(true)}
          >
            {label}
          </Button>
        ))}
      {isOpen && eligibleItems.length > 0 && (
        <StockEditor
          items={eligibleItems}
          initial={item && eligibleItems.some(row => row.id === item.id) ? item : eligibleItems[0]}
          today={today}
          workflow={workflow}
          refresh={refresh}
          onClose={() => setOpen(false)}
          returnFocusRef={returnFocusRef}
        />
      )}
    </>
  );
}

function StockEditor({
  items,
  initial,
  today,
  workflow,
  refresh,
  onClose,
  returnFocusRef,
}: {
  items: InventoryItem[];
  initial: InventoryItem;
  today: string;
  workflow: StockWorkflow;
  refresh: () => Promise<unknown>;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [selected, setSelected] = useState<InventoryItem>(initial);
  const [unit, setUnit] = useState<string>(initial.base_unit);
  const [quantity, setQuantity] = useState("");
  const [costInput, setCostInput] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentSubtype>("wastage");
  const [reason, setReason] = useState(
    workflow === "opening"
      ? "Opening stock"
      : workflow === "receipt"
        ? "Stock received"
        : workflow === "correction"
          ? "Wastage / spillage"
          : "",
  );
  const operation = useRef(crypto.randomUUID());
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    payload: ReturnType<typeof stockSchema.parse>;
    rows: ReviewRow[];
  }>();

  const unitOptions = [
    { value: selected.base_unit, label: unitLabel(selected.base_unit) },
    ...(selected.base_unit === "g" ? [{ value: "kg", label: "kg — kilograms (× 1,000 g)" }] : []),
    ...(selected.base_unit === "ml" ? [{ value: "L", label: "L — liters (× 1,000 mL)" }] : []),
  ];

  const effectiveKind: "opening" | "receipt" | "count" | "waste" | "correction" =
    workflow === "opening"
      ? "opening"
      : workflow === "receipt"
        ? "receipt"
        : workflow === "count"
          ? "count"
          : adjustmentType === "increase" || adjustmentType === "decrease"
            ? "correction"
            : "waste";

  const systemScaled = scaled(String(selected.quantity));
  let parsedEntered: bigint | null = null;
  let convertedBase: bigint | null = null;
  let deltaScaled: bigint | null = null;
  try {
    const raw = scaled(quantity.trim());
    if (raw >= 0n) {
      parsedEntered = raw;
      convertedBase = raw * (unit === "kg" || unit === "L" ? 1000n : 1n);
      deltaScaled =
        workflow === "count"
          ? convertedBase - systemScaled
          : workflow === "correction"
            ? adjustmentType === "increase"
              ? convertedBase
              : -convertedBase
            : convertedBase;
    }
  } catch {
    parsedEntered = null;
  }

  const needsIncreaseCost =
    workflow === "correction" &&
    adjustmentType === "increase" &&
    (systemScaled <= 0n || selected.value_cents === null);

  const dialogTitle =
    workflow === "opening"
      ? "Set Opening Stock"
      : workflow === "count"
        ? "Count Stock"
        : workflow === "correction"
          ? "Adjust Stock"
          : "Stock In";

  let previewUnitCost: string | undefined;
  try {
    if (convertedBase !== null && convertedBase > 0n && costInput.trim()) {
      previewUnitCost = formatUnitCost(decimal((BigInt(cents(costInput.trim())) * 1_000_000_000_000n) / convertedBase));
    }
  } catch {
    // Submission retains the existing monetary validation and error feedback.
  }

  return (
    <AppFormDialog open onClose={onClose} title={dialogTitle} size={workflow === "receipt" || workflow === "opening" ? "lg" : "md"} returnFocusRef={returnFocusRef}>
      <form
        className="dialog-form"
        onSubmit={event => {
          event.preventDefault();
          setError("");
          const form = new FormData(event.currentTarget);
          try {
            if (parsedEntered === null || convertedBase === null || deltaScaled === null) {
              throw new Error("Enter a valid positive quantity with up to six decimal places.");
            }
            if ((workflow === "opening" || workflow === "receipt" || workflow === "correction") && parsedEntered <= 0n) {
              throw new Error("Enter a quantity greater than zero.");
            }
            if (workflow === "count" && deltaScaled === 0n && !costInput.trim()) {
              throw new Error("Counted quantity matches the system quantity. Enter a new valuation only if correcting missing cost.");
            }
            const effectiveQuantityString =
              workflow === "correction" && adjustmentType === "decrease"
                ? `-${quantity.trim().replace(/^-/, "")}`
                : quantity.trim();
            const submittedReason =
              workflow === "opening"
                ? reason.trim() || "Opening stock"
                : workflow === "receipt"
                  ? reason.trim() || "Stock received"
                  : reason.trim();
            const parsedCost = costInput.trim() ? cents(costInput.trim()) : undefined;
            const payload = stockSchema.parse({
              operation_id: operation.current,
              ingredient_id: selected.id,
              kind: effectiveKind,
              quantity: effectiveQuantityString,
              purchase_unit: unit,
              occurred_on: form.get("occurred_on"),
              reason: submittedReason,
              notes: String(form.get("notes") ?? ""),
              supplier: String(form.get("supplier") ?? ""),
              reference: String(form.get("reference") ?? ""),
              ...(workflow === "count" ? { expected_revision: selected.revision } : {}),
              ...(parsedCost !== undefined ? { total_cost_cents: parsedCost } : {}),
            });

            const updatedQty = systemScaled + deltaScaled;
            if (updatedQty < 0n) {
              throw new Error(
                `Cannot reduce stock below zero (current on hand: ${displayQuantity(selected.quantity, selected.base_unit)}).`,
              );
            }

            const rows: ReviewRow[] = [{ label: "Inventory Item", value: selected.name }];
            if (workflow === "receipt" || workflow === "opening") {
              rows.push({
                label: workflow === "opening" ? "Opening Quantity" : "Quantity Received",
                value: `${displayQuantity(payload.quantity, payload.purchase_unit)}`,
              });
              rows.push({
                label: "Base-Unit Conversion",
                value:
                  payload.purchase_unit !== selected.base_unit
                    ? `${displayQuantity(payload.quantity, payload.purchase_unit)} → ${displayQuantity(decimal(convertedBase), selected.base_unit)}`
                    : displayQuantity(decimal(convertedBase), selected.base_unit),
              });
              rows.push({
                label: "Total Purchase Cost",
                value: payload.total_cost_cents !== undefined ? money(payload.total_cost_cents) : "Not recorded",
              });
              if (payload.total_cost_cents !== undefined && convertedBase > 0n) {
                const unitCostCents = decimal((BigInt(payload.total_cost_cents) * 1_000_000_000_000n) / convertedBase);
                rows.push({
                  label: "Calculated Unit Cost",
                  value: `${formatUnitCost(unitCostCents)} per ${selected.base_unit === "each" ? "pc" : unitLabel(selected.base_unit)}`,
                });
              }
            } else if (workflow === "count") {
              rows.push({ label: "System Quantity", value: displayQuantity(selected.quantity, selected.base_unit) });
              rows.push({ label: "Counted Quantity", value: displayQuantity(decimal(convertedBase), selected.base_unit) });
              rows.push({ label: "Adjustment", value: signedQuantity(decimal(deltaScaled), selected.base_unit) });
              if (payload.total_cost_cents !== undefined) {
                rows.push({ label: "Counted Stock Value", value: money(payload.total_cost_cents) });
              }
            } else {
              rows.push({
                label: "Adjustment Type",
                value: adjustmentOptions.find(opt => opt.value === adjustmentType)?.label ?? "Stock Adjustment",
              });
              rows.push({ label: "Quantity Change", value: signedQuantity(decimal(deltaScaled), selected.base_unit) });
              rows.push({ label: "Reason", value: payload.reason });
              if (payload.total_cost_cents !== undefined) {
                rows.push({ label: "Added Stock Cost", value: money(payload.total_cost_cents) });
              }
            }
            rows.push({
              label: "Updated Stock Quantity",
              value: displayQuantity(decimal(updatedQty), selected.base_unit),
            });

            setReview({ payload, rows });
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Check the stock fields.");
          }
        }}
      >
        <DialogBody className="inventory-form-body">
          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}

          <fieldset className="inventory-form-section">
            <legend className="sr-only">Item</legend>
            <label className="field">
              Inventory item
              <Select
                value={selected.id}
                onValueChange={value => {
                  const next = items.find(row => row.id === value)!;
                  setSelected(next);
                  setUnit(next.base_unit);
                  operation.current = crypto.randomUUID();
                }}
                options={items.map(row => ({
                  value: row.id,
                  label: `${row.name} (${displayQuantity(row.quantity, row.base_unit)} on hand)`,
                }))}
              />
            </label>
          </fieldset>

          {workflow === "opening" || workflow === "receipt" ? (
            <>
              <fieldset className="inventory-form-section">
                <legend className="sr-only">Quantity</legend>
                <div className="inventory-form-grid">
                  <label className="field">
                    Quantity
                    <Input
                      value={quantity}
                      onChange={event => setQuantity(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label className="field">
                    Purchase unit
                    <Select value={unit} onValueChange={setUnit} options={unitOptions} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="inventory-form-section">
                <legend className="sr-only">Purchase Cost</legend>
                <label className="field">
                  Actual total purchase cost (PHP)
                  <Input
                    name="cost"
                    value={costInput}
                    onChange={event => setCostInput(event.target.value)}
                    inputMode="decimal"
                    required
                  />
                </label>
                {convertedBase !== null && convertedBase > 0n && <dl className="inventory-stock-preview" role="status" aria-label="Stock receipt preview">
                  <div><dt>Quantity added</dt><dd>{signedQuantity(decimal(convertedBase), selected.base_unit)}</dd></div>
                  <div><dt>Purchase unit cost</dt><dd>{previewUnitCost ? `${previewUnitCost} / ${unitLabel(selected.base_unit)}` : "—"}</dd></div>
                  <div><dt>Expected balance</dt><dd>{displayQuantity(decimal(systemScaled + convertedBase), selected.base_unit)}</dd></div>
                </dl>}
              </fieldset>

              <fieldset className="inventory-form-section">
                <legend>Additional Details</legend>
                <div className="inventory-form-grid">
                <label className="field">
                  {workflow === "opening" ? "Opening stock date" : "Receiving date"}
                  <DatePicker
                    label={workflow === "opening" ? "Opening stock date" : "Receiving date"}
                    name="occurred_on"
                    defaultValue={today}
                    required
                  />
                </label>
                  <label className="field">
                    Supplier (optional)
                    <Input name="supplier" maxLength={120} />
                  </label>
                </div>
                  <label className="field">
                    Reference (optional)
                    <Input name="reference" maxLength={120} />
                  </label>
                <label className="field">
                  Notes (optional)
                  <textarea
                    name="notes"
                    maxLength={1000}
                    rows={2}
                  />
                </label>
              </fieldset>
            </>
          ) : workflow === "count" ? (
            <>
              <fieldset className="inventory-form-section">
                <legend>Physical Count</legend>
                <div className="inventory-form-grid">
                  <label className="field">
                    Actual physical quantity
                    <Input
                      value={quantity}
                      onChange={event => setQuantity(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label className="field">
                    Count unit
                    <Select value={unit} onValueChange={setUnit} options={unitOptions} />
                  </label>
                </div>
                <dl className="inventory-count-comparison" role="status" aria-label="Physical count comparison">
                  <div>
                    <dt>System Quantity</dt>
                    <dd>{displayQuantity(selected.quantity, selected.base_unit)}</dd>
                  </div>
                  <div>
                    <dt>Counted Quantity</dt>
                    <dd>{convertedBase !== null ? displayQuantity(decimal(convertedBase), selected.base_unit) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Difference</dt>
                    <dd className={deltaScaled !== null && deltaScaled < 0n ? "inventory-quantity-decrease" : deltaScaled !== null && deltaScaled > 0n ? "inventory-quantity-increase" : undefined}>{deltaScaled !== null ? signedQuantity(decimal(deltaScaled), selected.base_unit) : "—"}</dd>
                  </div>
                </dl>
                {deltaScaled === 0n && <p className="hint inventory-quantity-increase">Stock matches the system balance.</p>}
              </fieldset>

              <fieldset className="inventory-form-section">
                <legend>Count Details</legend>
                <label className="field">
                  Count date
                  <DatePicker label="Count date" name="occurred_on" defaultValue={today} required />
                </label>
                <label className="field">
                  Reason
                  <Input
                    name="reason"
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    required
                    maxLength={500}
                  />
                </label>
                <label className="field">
                  Notes (optional)
                  <textarea name="notes" maxLength={1000} rows={2} />
                </label>
                <details className="inventory-advanced-details" open={selected.value_cents === null || undefined}>
                  <summary>Correct total stock value (optional)</summary>
                  <label className="field">
                    Actual total value of counted stock (PHP, optional)
                    <Input
                      name="cost"
                      value={costInput}
                      onChange={event => setCostInput(event.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <p className="hint">
                    Entering a value overrides the counted stock valuation.
                  </p>
                </details>
              </fieldset>
            </>
          ) : (
            <>
              <fieldset className="inventory-form-section">
                <legend>Adjustment</legend>
                <label className="field">
                  Adjustment reason category
                  <Select
                    value={adjustmentType}
                    onValueChange={value => {
                      const next = value as AdjustmentSubtype;
                      const prevDefault = adjustmentOptions.find(opt => opt.value === adjustmentType)?.defaultReason ?? "";
                      const nextDefault = adjustmentOptions.find(opt => opt.value === next)?.defaultReason ?? "";
                      setAdjustmentType(next);
                      if (!reason || reason === prevDefault) setReason(nextDefault);
                    }}
                    options={adjustmentOptions.map(opt => ({ value: opt.value, label: opt.label }))}
                  />
                </label>
                <div className="inventory-form-grid">
                  <label className="field">
                    {adjustmentType === "increase" ? "Quantity to add" : "Quantity to deduct"}
                    <Input
                      value={quantity}
                      onChange={event => setQuantity(event.target.value)}
                      inputMode="decimal"
                      required
                    />
                  </label>
                  <label className="field">
                    Entry unit
                    <Select value={unit} onValueChange={setUnit} options={unitOptions} />
                  </label>
                </div>
                {deltaScaled !== null && parsedEntered !== null && parsedEntered > 0n && (
                  <p className={`inventory-change ${deltaScaled < 0n ? "inventory-quantity-decrease" : "inventory-quantity-increase"}`} role="status">
                    Stock change: <strong>{signedQuantity(decimal(deltaScaled), selected.base_unit)}</strong> · Updated on hand:{" "}
                    <strong>{displayQuantity(decimal(systemScaled + deltaScaled), selected.base_unit)}</strong>
                  </p>
                )}
                {adjustmentType === "increase" && (
                  <label className="field">
                    {needsIncreaseCost ? "Actual cost of added stock (PHP)" : "Cost of added stock (PHP, optional)"}
                    <Input
                      name="cost"
                      value={costInput}
                      onChange={event => setCostInput(event.target.value)}
                      inputMode="decimal"
                      required={needsIncreaseCost}
                    />
                  </label>
                )}
              </fieldset>

              <fieldset className="inventory-form-section">
                <legend>Details</legend>
                <label className="field">
                  Adjustment date
                  <DatePicker label="Adjustment date" name="occurred_on" defaultValue={today} required />
                </label>
                <label className="field">
                  Reason
                  <Input
                    name="reason"
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    required
                    maxLength={500}
                  />
                </label>
                <label className="field">
                  Notes (optional)
                  <textarea name="notes" maxLength={1000} rows={2} />
                </label>
              </fieldset>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" data-dialog-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            {workflow === "receipt"
              ? "Review Stock Receipt"
              : workflow === "opening"
                ? "Review Opening Stock"
                : workflow === "count"
                  ? "Review Count"
                  : "Review Adjustment"}
          </Button>
        </DialogFooter>
      </form>
      {review && (
        <InventoryConfirm
          title={
            workflow === "opening"
              ? "Confirm Opening Stock?"
              : workflow === "receipt"
                ? "Confirm Stock Receipt?"
                : workflow === "count"
                  ? "Confirm Stock Count?"
                  : "Confirm Stock Adjustment?"
          }
          summaryRows={review.rows}
          confirmLabel="Confirm & Post"
          onClose={() => setReview(undefined)}
          onConfirm={async () => {
            await saveInventory("stock", review.payload);
            await refresh();
            notify.success(
              workflow === "opening"
                ? "Opening stock recorded"
                : workflow === "receipt"
                  ? "Stock received"
                  : workflow === "count"
                    ? "Stock count posted"
                    : "Stock adjustment posted",
            );
            onClose();
          }}
        />
      )}
    </AppFormDialog>
  );
}
