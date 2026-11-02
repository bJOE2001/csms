"use client";

import { useState } from "react";
import { MutationForm } from "./mutation-form";
import { publishRecipe } from "@/app/app/menu/actions";
import { estimateRecipeCost, phpToCents } from "@/lib/menu/domain";
import { formatPhp } from "@/lib/money";

type IngredientOption = { id: string; name: string; base_unit: string; estimated_unit_cost_cents: string | null };
type Line = { key: string; ingredientId: string; quantity: string; wastePercent: string };

export function RecipeEditor({ variants, ingredients }: { variants: { id: string; label: string }[]; ingredients: IngredientOption[] }) {
  const [lines, setLines] = useState<Line[]>([{ key: "first", ingredientId: "", quantity: "", wastePercent: "0" }]);
  const update = (key: string, field: keyof Omit<Line, "key">, value: string) => setLines((previous) => previous.map((line) => line.key === key ? { ...line, [field]: value } : line));
  const items = lines.map((line) => {
    let wasteBps = -1;
    try { wasteBps = phpToCents(line.wastePercent); } catch { /* Invalid draft input is rejected by the server schema on publication. */ }
    return { ingredient_id: line.ingredientId, quantity: line.quantity, waste_bps: wasteBps };
  });
  let preview = "Select ingredients and enter quantities to preview the estimated cost.";
  try {
    if (lines.every((line) => line.ingredientId && line.quantity)) {
      const estimate = estimateRecipeCost(items.map((item) => ({ quantity: item.quantity, wasteBps: item.waste_bps, unitCostCentavos: ingredients.find((ingredient) => ingredient.id === item.ingredient_id)?.estimated_unit_cost_cents ?? null })));
      preview = estimate.status === "estimated" ? `Estimated ingredient cost: ${formatPhp(estimate.cents)} per serving.` : "Cost unavailable: at least one ingredient has no estimate.";
    }
  } catch { preview = "Check quantities and waste percentages to calculate an estimate."; }

  return <MutationForm action={publishRecipe} submitLabel="Publish recipe version" disabled={!variants.length || !ingredients.length}>
    <label className="field">Sellable variant<select name="variant_id" required defaultValue=""><option value="" disabled>Select a variant</option>{variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.label}</option>)}</select></label>
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    {lines.map((line, index) => {
      const ingredient = ingredients.find((item) => item.id === line.ingredientId);
      return <div className="recipe-line" key={line.key}>
        <label className="field">Ingredient {index + 1}<select required value={line.ingredientId} onChange={(event) => update(line.key, "ingredientId", event.target.value)}><option value="" disabled>Select ingredient</option>{ingredients.map((item) => <option key={item.id} value={item.id} disabled={lines.some((other) => other.key !== line.key && other.ingredientId === item.id)}>{item.name} ({item.base_unit})</option>)}</select></label>
        <div className="field-pair"><label className="field">Quantity ({ingredient?.base_unit ?? "base units"})<input required inputMode="decimal" value={line.quantity} maxLength={19} onChange={(event) => update(line.key, "quantity", event.target.value)} /></label><label className="field">Waste allowance (%)<input required inputMode="decimal" value={line.wastePercent} maxLength={6} onChange={(event) => update(line.key, "wastePercent", event.target.value)} /></label></div>
        {lines.length > 1 && <button type="button" className="text-button" onClick={() => setLines((previous) => previous.filter((item) => item.key !== line.key))}>Remove ingredient {index + 1}</button>}
      </div>;
    })}
    <button type="button" className="button secondary" disabled={lines.length >= 64} onClick={() => setLines((previous) => [...previous, { key: crypto.randomUUID(), ingredientId: "", quantity: "", wastePercent: "0" }])}>Add ingredient</button>
    <p className="cost-preview" aria-live="polite">{preview}</p>
    <p className="hint">Publication saves a new immutable recipe and ingredient-cost snapshot. This estimate does not establish accounting COGS.</p>
  </MutationForm>;
}
