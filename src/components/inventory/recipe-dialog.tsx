"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { BookOpenCheck, Trash2 } from "lucide-react";
import type { Product } from "@/lib/menu/domain";
import { readInventory, saveInventory } from "@/lib/inventory/client";
import {
  decimal,
  displayQuantity,
  formatUnitCost,
  itemTypes,
  recipeSchema,
  scaled,
  unitLabel,
  type InventoryData,
} from "@/lib/inventory/domain";
import { money } from "@/lib/sales/domain";
import { useLoadingSignal } from "../ui/global-loading-bar";
import { LoadingLink as Link } from "../ui/loading-link";
import { TableActionButton } from "../ui/table-action-button";
import { AppFormDialog } from "../ui/app-form-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { DialogBody, DialogFooter } from "../ui/dialog-layout";
import { InventoryConfirm } from "./inventory-confirm";
import { notify } from "@/lib/notify";

const recipeQuantity = (value: string | number) => String(value).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

type RecipeDialogProps = {
  product: Product;
  refresh: () => Promise<unknown>;
  initialSizeId?: string;
  initialOpen?: boolean;
  hideTrigger?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
};

export function RecipeDialog({
  product, refresh, initialSizeId, initialOpen = false, hideTrigger = false, returnFocusRef, onClose,
}: RecipeDialogProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      {!hideTrigger && (
        <TableActionButton
          icon={BookOpenCheck}
          tooltip="Manage Recipe"
          label={`Manage Recipe for ${product.name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        />
      )}
      {open && (
        <RecipeLoader
          product={product}
          refresh={refresh}
          initialSizeId={initialSizeId}
          returnFocusRef={returnFocusRef}
          onClose={() => { setOpen(false); onClose?.(); }}
        />
      )}
    </>
  );
}

function RecipeLoader({
  product,
  refresh,
  onClose,
  initialSizeId,
  returnFocusRef,
}: {
  product: Product;
  refresh: () => Promise<unknown>;
  onClose: () => void;
  initialSizeId?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const [sizeId, setSizeId] = useState(initialSizeId ?? product.sizes?.[0]?.id ?? "regular");
  const [pending, setPending] = useState(false);
  const [data, setData] = useState<InventoryData>();
  const [error, setError] = useState("");
  useLoadingSignal(!data && !error);

  useEffect(() => {
    const controller = new AbortController();
    readInventory(undefined, undefined, controller.signal)
      .then(setData)
      .catch(failure => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, []);

  const config = data?.configs.find(row => row.product_id === product.id && row.size_key === (sizeId === "regular" ? "" : sizeId));
  const sizeLabel = product.sizes?.find(size => size.id === sizeId)?.label ?? "Regular";
  const status = config?.active ? (config.active.cost_cents == null || (config.active.max_quantity ?? 0) <= 0 ? "Recipe Active - Needs Attention" : "Recipe Active") : config?.draft ? "Draft" : "Not Configured";
  return (
    <AppFormDialog
      open
      onClose={onClose}
      title={`Recipe · ${product.name}`}
      size="lg"
      description={`${sizeLabel} · ${status}${config?.active && config?.draft ? " · New draft saved" : ""}`}
      dismissible={!pending}
      className="recipe-dialog"
      returnFocusRef={returnFocusRef}
    >
      {!data ? (
        <DialogBody>
          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : (
            <p role="status">Loading inventory configuration…</p>
          )}
        </DialogBody>
      ) : (
        <RecipeEditor product={product} data={data} refresh={refresh} onClose={onClose} sizeId={sizeId} setSizeId={setSizeId} pending={pending} setPending={setPending} />
      )}
    </AppFormDialog>
  );
}

function RecipeEditor({
  product,
  data,
  refresh,
  onClose,
  sizeId, setSizeId, pending, setPending,
}: {
  product: Product;
  data: InventoryData;
  refresh: () => Promise<unknown>;
  onClose: () => void;
  sizeId: string; setSizeId: (value: string) => void; pending: boolean; setPending: (value: boolean) => void;
}) {
  const config = data.configs.find(
    row => row.product_id === product.id && row.size_key === (sizeId === "regular" ? "" : sizeId),
  );
  const source = config?.draft ?? config?.active;

  const [parts, setParts] = useState(
    (source?.components ?? []).map(row => ({
      ingredient_id: row.ingredient_id,
      quantity: recipeQuantity(row.quantity),
      key: crypto.randomUUID(),
    })),
  );
  const [mode, setMode] = useState<"recipe" | "finished_good">(source?.mode ?? "recipe");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"activate" | "deactivate">();
  const operation = useRef(crypto.randomUUID());

  const selectedSize = product.sizes?.find(size => size.id === sizeId);
  const selectedSizeLabel = selectedSize?.label ?? "Regular";
  const sellingPrice = selectedSize?.price_cents ?? product.price_cents;

  const availableItems =
    mode === "finished_good"
      ? data.items.filter(item => item.item_type === "finished_good" || parts.some(part => part.ingredient_id === item.id))
      : data.items;

  async function apply(action: "draft" | "activate" | "deactivate") {
    const payload = recipeSchema.parse({
      operation_id: operation.current,
      product_id: product.id,
      size_id: sizeId === "regular" ? null : sizeId,
      action,
      mode,
      expected_revision: config?.revision ?? 0,
      ...(action === "draft"
        ? { components: parts.map(({ ingredient_id, quantity }) => ({ ingredient_id, quantity })) }
        : {}),
    });
    await saveInventory("recipe", payload);
    await refresh();
    notify.success(
      action === "draft"
        ? "Recipe draft saved"
        : action === "activate"
          ? "Inventory tracking activated"
          : "Inventory tracking deactivated",
    );
    onClose();
  }

  return (
    <>
      <form
        className="dialog-form"
        onSubmit={async event => {
          event.preventDefault();
          if (pending) return;
          setPending(true);
          setError("");
          try {
            await apply("draft");
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Recipe could not be saved.");
          } finally {
            setPending(false);
          }
        }}
      >
        <DialogBody className="inventory-form-body">
          {error && (
            <p role="alert" className="form-message error">
              {error}
            </p>
          )}

          <div className="inventory-form-grid">
            <label className="field">
              Product size
              <Select
                value={sizeId}
                disabled={pending}
                onValueChange={value => {
                  const next = data.configs.find(
                    row => row.product_id === product.id && row.size_key === (value === "regular" ? "" : value),
                  );
                  const recipe = next?.draft ?? next?.active;
                  setSizeId(value);
                  setMode(recipe?.mode ?? "recipe");
                  setParts(
                    (recipe?.components ?? []).map(row => ({
                      ingredient_id: row.ingredient_id,
                      quantity: recipeQuantity(row.quantity),
                      key: crypto.randomUUID(),
                    })),
                  );
                  operation.current = crypto.randomUUID();
                  setError("");
                }}
                options={
                  product.sizes?.length
                    ? product.sizes.map(size => ({ value: size.id, label: size.label }))
                    : [{ value: "regular", label: "Regular — single size" }]
                }
              />
            </label>
            <label className="field">
              Inventory mode
              <Select
                value={mode}
                disabled={pending}
                onValueChange={value => setMode(value as "recipe" | "finished_good")}
                options={[
                  { value: "recipe", label: "Recipe-based preparation (ingredients & cups)" },
                  { value: "finished_good", label: "Finished-good tracking (ready-to-sell item)" },
                ]}
              />
            </label>
          </div>

          <p className="hint recipe-mode-help">
            {mode === "finished_good" ? "Tracks ready-to-sell stock and eligible returns." : "Stock deducted on completed sales."}
          </p>

          {source && (
            <section className="inventory-breakdown-card" aria-label="Saved recipe cost breakdown">
              <div className="inventory-breakdown-header">
                <h3>
                  {config?.draft ? "Saved Draft" : "Active Recipe"} · v{source.version}
                </h3>
                <span
                  className={`inventory-badge ${
                    source.cost_cents === null
                      ? "inventory-badge-warning"
                      : "inventory-badge-success"
                  }`}
                >
                  {source.cost_cents === null
                    ? "Incomplete — Missing Cost"
                    : source.cost_cents === 0
                      ? "Complete (₱0.00 Verified)"
                      : "Cost Complete"}
                </span>
              </div>

              <dl className="inventory-breakdown-summary">
                <div>
                  <dt>Total Preparation Cost</dt>
                  <dd>{source.cost_cents === null ? "Incomplete — record stock costs" : money(source.cost_cents)}</dd>
                </div>
                <div>
                  <dt>Selling Price</dt>
                  <dd>{money(sellingPrice)}</dd>
                </div>
                <div>
                  <dt>Estimated Gross Profit</dt>
                  <dd>{source.cost_cents === null ? "—" : money(sellingPrice - source.cost_cents)}</dd>
                </div>
                <div>
                  <dt>Cost Completeness Status</dt>
                  <dd>
                    {source.cost_cents === null
                      ? "Incomplete"
                      : source.cost_cents === 0
                        ? "Complete (free stock)"
                        : "Complete"}
                  </dd>
                </div>
              </dl>
              <details className="recipe-saved-components">
                <summary>Saved recipe breakdown</summary>
              {source.components.length > 0 ? (
                <table className="inventory-breakdown-table">
                  <thead>
                    <tr>
                      <th scope="col">Inventory Item</th>
                      <th scope="col">Quantity</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {source.components.map(row => (
                      <tr key={row.ingredient_id}>
                        <td>
                          {row.name}
                          {row.active === false ? " (Inactive)" : ""}
                        </td>
                        <td>{displayQuantity(row.quantity, row.base_unit)}</td>
                        <td>
                          {row.component_cost_cents == null
                            ? "Missing cost"
                            : formatUnitCost(row.component_cost_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="hint">No components saved in this draft yet.</p>
              )}

              </details>

              <p className="hint">
                Save a draft to refresh costs; activate it to update the active recipe. Gross profit excludes operating expenses.
              </p>
            </section>
          )}
          {!source && <p className="dialog-note">Save a draft to calculate Total Preparation Cost, Estimated Gross Profit, and cost completeness. Selling Price: {money(sellingPrice)}.</p>}

          <div className="inventory-recipe-heading">
            <h3>Required Inventory Items</h3>
            <Button
              variant="outline"
              disabled={pending || parts.length >= 50 || !availableItems.some(item => item.active)}
              onClick={() =>
                setParts(rows => [...rows, { ingredient_id: "", quantity: "", key: crypto.randomUUID() }])
              }
            >
              Add component
            </Button>
          </div>

          {!data.items.length ? (
            <p className="hint">
              No inventory items exist yet. Create your ingredients, packaging, or finished goods in{" "}
              <Link href="/app/inventory">Inventory</Link> first.
            </p>
          ) : mode === "finished_good" && !availableItems.some(item => item.active) ? (
            <p className="hint">
              No active Finished Good items found. Add one in <Link href="/app/inventory">Inventory</Link> or switch to Recipe-based preparation.
            </p>
          ) : parts.length === 0 ? (
            <p className="hint">
              Add the inventory items used to prepare one {selectedSizeLabel !== "Regular" ? `${selectedSizeLabel} ` : ""}
              {product.name}.
            </p>
          ) : null}

          {parts.map((part, index) => {
            const item = data.items.find(row => row.id === part.ingredient_id);
            let liveLineCost: string | null = null;
            if (item && item.unit_cost_cents !== null && part.quantity.trim()) {
              try {
                const qtyScaled = scaled(part.quantity.trim());
                if (qtyScaled > 0n) {
                  const unitParts = /^(\d+)(?:\.(\d+))?$/.exec(String(item.unit_cost_cents));
                  if (unitParts) {
                    const frac = unitParts[2] ?? "";
                    const unitScaled = BigInt(unitParts[1]) * 1_000_000n + BigInt(frac.slice(0, 6).padEnd(6, "0"));
                    const prodScaled = (qtyScaled * unitScaled + 500_000n) / 1_000_000n;
                    liveLineCost = formatUnitCost(decimal(prodScaled));
                  }
                }
              } catch {
                liveLineCost = null;
              }
            }
            const typeText = item ? itemTypes.find(t => t.value === item.item_type)?.label : "";
            return (
              <fieldset className="inventory-recipe-row" key={part.key}>
                <legend className="sr-only">Component {index + 1}</legend>
                <label className="field">
                  Inventory item
                  <Select
                    value={part.ingredient_id}
                    disabled={pending}
                    placeholder="Choose an item"
                    onValueChange={value =>
                      setParts(rows => rows.map(row => (row.key === part.key ? { ...row, ingredient_id: value } : row)))
                    }
                    options={availableItems.map(option => ({
                      value: option.id,
                      label: `${option.name} (${unitLabel(option.base_unit)})${option.active ? "" : " · Inactive"}`,
                    }))}
                  />
                </label>
                <label className="field">
                  Quantity {item ? `(${unitLabel(item.base_unit)})` : ""}
                  <Input
                    required
                    disabled={pending}
                    inputMode="decimal"
                    value={part.quantity}
                    placeholder={item?.base_unit === "g" ? "e.g., 18" : item?.base_unit === "ml" ? "e.g., 200" : "e.g., 1"}
                    onChange={event =>
                      setParts(rows =>
                        rows.map(row => (row.key === part.key ? { ...row, quantity: event.target.value } : row)),
                      )
                    }
                  />
                </label>
                <div className="field recipe-line-cost"><span>Component cost</span><output>{liveLineCost ?? (item?.unit_cost_cents == null ? "Missing cost" : "—")}</output></div>
                <TableActionButton
                  disabled={pending}
                  icon={Trash2}
                  label={`Remove component ${index + 1}`}
                  onClick={() => setParts(rows => rows.filter(row => row.key !== part.key))}
                  variant="destructive"
                />
                {item && (
                  <p className="hint inventory-recipe-cost">
                    {typeText} · Available: <strong>{displayQuantity(item.quantity, item.base_unit)}</strong> · Unit cost:{" "}
                    <strong>{formatUnitCost(item.unit_cost_cents)}</strong>
                  </p>
                )}
              </fieldset>
            );
          })}

          {config?.active && <details className="recipe-tracking-settings">
            <summary>Tracking settings</summary>
            <p className="hint">Deactivation prevents future sales of this size until a valid recipe is activated.</p>
            <Button variant="outline" disabled={pending} onClick={() => setConfirm("deactivate")}>Deactivate tracking</Button>
          </details>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" disabled={pending} data-dialog-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={config?.draft ? "outline" : "default"} pending={pending} pendingLabel="Saving draft…">
            Save draft
          </Button>
          {config?.draft && <Button disabled={pending} onClick={() => setConfirm("activate")}>Activate saved draft</Button>}
        </DialogFooter>
      </form>

      {confirm && (
        <InventoryConfirm
          title={confirm === "activate" ? "Activate saved recipe?" : "Deactivate inventory tracking?"}
          description={
            confirm === "activate"
              ? "Future POS sales of this product size will automatically deduct these inventory items and use the calculated preparation cost. Unsaved edits in the form are not included."
              : "This product size cannot be sold until a valid inventory recipe is activated again. Completed receipts remain unchanged."
          }
          summaryRows={[
            { label: "Product", value: product.name },
            { label: "Size", value: selectedSizeLabel },
            ...(confirm === "activate" && config?.draft
              ? [
                  {
                    label: "Components",
                    value: `${config.draft.components.length} item${config.draft.components.length === 1 ? "" : "s"}`,
                  },
                  {
                    label: "Total Preparation Cost",
                    value: config.draft.cost_cents === null ? "Incomplete" : money(config.draft.cost_cents),
                  },
                ]
              : []),
          ]}
          confirmLabel="Confirm"
          onClose={() => setConfirm(undefined)}
          onConfirm={() => apply(confirm)}
        />
      )}
    </>
  );
}
