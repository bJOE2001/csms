"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { BookOpenCheck, Trash2 } from "lucide-react";
import type { Product } from "@/lib/menu/domain";
import { readInventory, saveInventory } from "@/lib/inventory/client";
import { createRecipeSaveAttempt, saveRecipeAttempt, type RecipeSaveAttempt } from "@/lib/inventory/recipe-save";
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
        <>
        <DialogBody>
          {error ? (
            <p className="form-message error" role="alert">
              {error}
            </p>
          ) : (
            <p role="status">Loading inventory configuration…</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" data-dialog-cancel onClick={onClose}>Cancel</Button>
        </DialogFooter>
        </>
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
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [savingIntent, setSavingIntent] = useState<"draft" | "activate">("activate");
  const [savingStage, setSavingStage] = useState<"draft" | "activate">("draft");
  const submission = useRef<{ key: string; attempt: RecipeSaveAttempt } | undefined>(undefined);
  const revisions = useRef(new Map<string, number>());
  const submitting = useRef(false);
  const operation = useRef(crypto.randomUUID());

  const selectedSize = product.sizes?.find(size => size.id === sizeId);
  const selectedSizeLabel = selectedSize?.label ?? "Regular";
  const sellingPrice = selectedSize?.price_cents ?? product.price_cents;

  const availableItems =
    mode === "finished_good"
      ? data.items.filter(item => item.item_type === "finished_good" || parts.some(part => part.ingredient_id === item.id))
      : data.items;

  const components = parts.map(({ ingredient_id, quantity }) => ({ ingredient_id, quantity }));
  const submissionKey = (intent: "draft" | "activate") => JSON.stringify({ sizeId, mode, components, intent });
  const currentAttempt = submission.current?.key === submissionKey("activate") ? submission.current.attempt : undefined;

  async function submit(intent: "draft" | "activate") {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setSavingIntent(intent);
    setSavingStage("draft");
    setError("");
    let attempt: RecipeSaveAttempt | undefined;
    try {
      const key = submissionKey(intent);
      if (submission.current?.key !== key) {
        const revision = revisions.current.get(sizeId) ?? config?.revision ?? 0;
        const matchesSavedDraft = revision === config?.revision && config?.draft?.mode === mode &&
          JSON.stringify(components) === JSON.stringify(config.draft.components.map(row => ({ ingredient_id: row.ingredient_id, quantity: recipeQuantity(row.quantity) })));
        submission.current = { key, attempt: createRecipeSaveAttempt({
          product_id: product.id, size_id: sizeId === "regular" ? null : sizeId,
          expected_revision: revision, mode, components,
        }, intent === "activate", matchesSavedDraft) };
      }
      attempt = submission.current.attempt;
      await saveRecipeAttempt(attempt, payload => saveInventory("recipe", payload), setSavingStage);
      await refresh();
      notify.success(intent === "activate" ? "Recipe saved and activated" : "Recipe draft saved");
      onClose();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "Recipe could not be saved.";
      setError(attempt?.activated ? `Recipe activated, but the menu could not refresh. ${message}`
        : intent === "activate" && attempt?.draftSaved ? `Draft saved. Activation failed: ${message}` : message);
      if (attempt?.draftSaved && !attempt.activated) await refresh().catch(() => {});
    } finally {
      if (attempt?.draftSaved) revisions.current.set(sizeId, attempt.revisionAfterDraft + (attempt.activated ? 1 : 0));
      submitting.current = false;
      setPending(false);
    }
  }

  async function deactivate() {
    const payload = recipeSchema.parse({
      operation_id: operation.current,
      product_id: product.id,
      size_id: sizeId === "regular" ? null : sizeId,
      action: "deactivate",
      mode,
      expected_revision: revisions.current.get(sizeId) ?? config?.revision ?? 0,
    });
    await saveInventory("recipe", payload);
    await refresh();
    notify.success("Recipe deactivated");
    onClose();
  }

  return (
    <>
      <form
        className="dialog-form"
        onSubmit={event => {
          event.preventDefault();
          void submit("activate");
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

            </section>
          )}
          {!source && <p className="dialog-note">Preparation cost: not calculated · Selling price: {money(sellingPrice)}</p>}

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
            <p className="hint">No components added.</p>
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
            <summary>Advanced settings</summary>
            <p className="hint">Deactivation prevents future sales of this size until a valid recipe is activated.</p>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmDeactivate(true)}>Deactivate Recipe</Button>
          </details>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" disabled={pending} data-dialog-cancel onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" disabled={pending} pending={pending && savingIntent === "draft"} pendingLabel="Saving draft…"
            onClick={event => { if (event.currentTarget.form?.reportValidity()) void submit("draft"); }}>
            Save draft
          </Button>
          <Button type="submit" disabled={pending} pending={pending && savingIntent === "activate"}
            pendingLabel={savingStage === "activate" ? "Activating…" : "Saving…"}>
            {currentAttempt?.activated ? "Refresh menu" : currentAttempt?.draftSaved ? "Retry activation" : "Save & Activate"}
          </Button>
        </DialogFooter>
      </form>

      {confirmDeactivate && (
        <InventoryConfirm
          title="Deactivate recipe?"
          description="This product size cannot be sold until a valid inventory recipe is activated again. Completed receipts remain unchanged."
          summaryRows={[
            { label: "Product", value: product.name },
            { label: "Size", value: selectedSizeLabel },
          ]}
          confirmLabel="Confirm"
          onClose={() => setConfirmDeactivate(false)}
          onConfirm={deactivate}
        />
      )}
    </>
  );
}
