import { requireFounder } from "@/lib/auth/require-founder";
import { loadMenu } from "@/lib/menu/data";
import { centavoDecimalToPhp } from "@/lib/menu/domain";
import { asCents, formatPhp } from "@/lib/money";
import { WorkspaceHeader } from "@/components/workspace-header";
import { PageAction, PageGuide } from "@/components/workspace/page-guide";
import { MutationForm } from "@/components/mutation-form";
import { RecipeEditor } from "@/components/recipe-editor";
import { createIngredient, reviseEstimate } from "../menu/actions";

export default async function RecipesPage() {
  const { supabase, shop } = await requireFounder();
  const { ingredients, products, variants, recipes } = await loadMenu(supabase, shop.id);
  const { data: items, error } = await supabase.from("recipe_items")
    .select("id, recipe_id, ingredient_name_snapshot, base_unit_snapshot, quantity::text, waste_bps, estimated_unit_cost_cents::text")
    .eq("shop_id", shop.id).limit(1000);
  if (error) throw new Error("Recipe history could not be loaded. Check the database migrations and try again.");
  if (items?.length === 1000) throw new Error("Recipe history reached this view's record limit. Pagination is required.");
  const variantOptions = variants.map((variant) => ({ id: variant.id, label: `${products.find((product) => product.id === variant.product_id)?.name ?? "Product"} · ${variant.name}` }));
  const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: shop.timezone });

  return <main className="shell workspace-shell">
    <WorkspaceHeader active="recipes" shopName={shop.name} />
    <div className="workspace-content" id="workspace-main" tabIndex={-1}>
      <div className="page-heading"><div><p className="eyebrow">Prepare every serving</p><h1>Recipes &amp; costing</h1><p className="hint">Use grams, milliliters, or pieces consistently. Each published version preserves the ingredient estimates used at publication.</p></div><PageAction module="recipes"/></div>
      <PageGuide module="recipes"/>
      <div className="management-layout">
        <section aria-labelledby="recipe-heading">
          <div className="panel" id="publish-recipe"><h2 id="recipe-heading">Publish a recipe</h2><RecipeEditor variants={variantOptions} ingredients={ingredients} />{(!ingredients.length || !variants.length) && <p className="hint">Create an ingredient and a sellable menu variant before publishing a recipe.</p>}</div>
          <h2>Published recipe history</h2>
          {!recipes.length && <div className="empty-state"><h3>No recipes published yet</h3><p>Your first recipe will appear here with a preserved cost snapshot. Missing ingredient prices are shown as unavailable.</p></div>}
          {variants.map((variant) => {
            const versions = recipes.filter((recipe) => recipe.variant_id === variant.id);
            if (!versions.length) return null;
            return <article className="panel" key={variant.id}><h3>{variantOptions.find((option) => option.id === variant.id)?.label}</h3>
              {versions.map((recipe, index) => <details key={recipe.id} open={index === 0}>
                <summary>Version {recipe.version}{index === 0 ? " · Current" : " · Historical"} · {recipe.cost_status === "estimated" && recipe.estimated_cost_cents !== null ? `${formatPhp(asCents(recipe.estimated_cost_cents))} estimated` : "Cost unavailable"}</summary>
                <p className="hint">Published {date.format(new Date(recipe.effective_at))} ({shop.timezone})</p>
                <ul className="history-list">{items?.filter((item) => item.recipe_id === recipe.id).map((item) => <li key={item.id}><strong>{item.ingredient_name_snapshot}</strong><span>{item.quantity} {item.base_unit_snapshot} · {(item.waste_bps / 100).toFixed(2)}% waste · {item.estimated_unit_cost_cents !== null ? `PHP ${centavoDecimalToPhp(item.estimated_unit_cost_cents)}/${item.base_unit_snapshot} estimated` : "unit cost unavailable"}</span></li>)}</ul>
              </details>)}
            </article>;
          })}
        </section>
        <aside className="setup-column" aria-label="Ingredient preparation">
          <section className="panel"><h2>Create an ingredient</h2><p className="hint">Catalogue setup creates no inventory. Leave an unknown cost blank.</p>
            <MutationForm action={createIngredient} submitLabel="Create ingredient">
              <label className="field">Ingredient name<input name="name" required maxLength={120} /></label>
              <label className="field">Base unit<select name="base_unit" defaultValue="g"><option value="g">Grams (g)</option><option value="ml">Milliliters (ml)</option><option value="each">Pieces (each)</option></select></label>
              <label className="field">Estimated PHP cost per one base unit<input name="estimated_unit_cost_php" inputMode="decimal" maxLength={19} /></label>
              <label className="field">Minimum stock threshold (base units)<input name="minimum_stock" inputMode="decimal" defaultValue="0" required maxLength={19} /></label>
            </MutationForm>
          </section>
          <section className="panel"><h2>Ingredient estimates <span className="count">{ingredients.length}</span></h2>
            {!ingredients.length && <p className="hint">No ingredients configured.</p>}
            {ingredients.map((ingredient) => <details key={ingredient.id}><summary>{ingredient.name} · {ingredient.base_unit}</summary>
              <p className="hint">Current estimate: {ingredient.estimated_unit_cost_cents !== null ? `PHP ${centavoDecimalToPhp(ingredient.estimated_unit_cost_cents)}/${ingredient.base_unit}` : "Unavailable"}. Stock threshold: {ingredient.minimum_stock} {ingredient.base_unit}.</p>
              <MutationForm action={reviseEstimate} submitLabel="Revise estimate">
                <input type="hidden" name="ingredient_id" value={ingredient.id} />
                <label className="field">Estimated PHP per {ingredient.base_unit}<input name="estimated_unit_cost_php" inputMode="decimal" maxLength={19} defaultValue={ingredient.estimated_unit_cost_cents !== null ? centavoDecimalToPhp(ingredient.estimated_unit_cost_cents) : ""} /></label>
              </MutationForm>
              <p className="hint">Publish a new recipe version to use a revised estimate. Older recipe versions retain their saved values.</p>
            </details>)}
          </section>
        </aside>
      </div>
    </div>
  </main>;
}


