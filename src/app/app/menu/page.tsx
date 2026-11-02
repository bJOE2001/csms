import { requireFounder } from "@/lib/auth/require-founder";
import { loadMenu, latestByVariant } from "@/lib/menu/data";
import { asCents, formatPhp } from "@/lib/money";
import { MutationForm } from "@/components/mutation-form";
import { WorkspaceHeader } from "@/components/workspace-header";
import { PageAction, PageGuide } from "@/components/workspace/page-guide";
import {BusinessForm,Field,Select} from "@/components/business/forms";
import { addVariant, createCategory, createProduct, publishPrice, setAvailability } from "./actions";

export default async function MenuPage() {
  const { supabase, shop } = await requireFounder();
  const { categories, products, variants, prices, recipes } = await loadMenu(supabase, shop.id);
  const currentPrices = latestByVariant(prices);
  const currentRecipes = latestByVariant(recipes);
  const date = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: shop.timezone });

  return <main className="shell workspace-shell">
    <WorkspaceHeader active="menu" shopName={shop.name} />
    <div className="workspace-content" id="workspace-main" tabIndex={-1}>
      <div className="page-heading"><div><p className="eyebrow">Pre-opening preparation</p><h1>Products &amp; menu</h1><p className="hint">Configure your sellable variants and prices. Each price change creates a preserved version.</p></div><PageAction module="menu"/></div>
      <PageGuide module="menu"/>
      <div className="management-layout">
        <section aria-labelledby="menu-heading">
          <h2 id="menu-heading">Menu catalogue <span className="count">{products.length} products · {variants.length} variants</span></h2>
          {!products.length && <div className="empty-state"><h3>Your menu starts here</h3><p>Create a category and your first product. A variant becomes available after its recipe is published and you enable it.</p></div>}
          {products.map((product) => <article className="panel" key={product.id}>
            <div className="section-heading"><div><p className="eyebrow">{categories.find((category) => category.id === product.category_id)?.name}</p><h3>{product.name}</h3></div></div>
            {variants.filter((variant) => variant.product_id === product.id).map((variant) => {
              const price = currentPrices.get(variant.id);
              const recipe = currentRecipes.get(variant.id);
              return <section key={variant.id} className="variant-row" aria-label={`${product.name} ${variant.name}`}>
                <div className="section-heading"><div><strong>{variant.name}</strong><p className="hint">{price ? `${formatPhp(asCents(price.price_cents))} · Price v${price.version}` : "Price unavailable"}</p></div><span className="status">{variant.available ? "Available" : "Disabled"}</span></div>
                <p className="hint">{recipe ? `Recipe v${recipe.version} published` : "Recipe missing — publish one before enabling this variant."}</p>
                <details><summary>Price history and availability</summary>
                  <ul className="history-list">{prices.filter((item) => item.variant_id === variant.id).map((item) => <li key={item.id}><strong>v{item.version} · {formatPhp(asCents(item.price_cents))}</strong><span>{date.format(new Date(item.effective_at))}</span></li>)}</ul>
                  <MutationForm action={publishPrice} submitLabel="Publish new price">
                    <input type="hidden" name="variant_id" value={variant.id} />
                    <label className="field">New selling price (PHP)<input name="price" inputMode="decimal" required maxLength={17} /></label>
                  </MutationForm>
                  <MutationForm action={setAvailability} submitLabel={variant.available ? "Disable variant" : "Enable for menu"} disabled={!recipe && !variant.available}>
                    <input type="hidden" name="variant_id" value={variant.id} /><input type="hidden" name="available" value={String(!variant.available)} />
                  </MutationForm>
                </details>
              </section>;
            })}
            <details><summary>Add another size or variant</summary>
              <MutationForm action={addVariant} submitLabel="Add variant">
                <input type="hidden" name="product_id" value={product.id} />
                <label className="field">Variant name<input name="variant_name" required maxLength={120} /></label>
                <label className="field">Selling price (PHP)<input name="price" inputMode="decimal" required maxLength={17} /></label>
              </MutationForm>
            </details>
            <details><summary>Edit product name and category</summary><BusinessForm module="settings" action="rename_product" label="Save product details" id={product.id}><Field name="name" label="Product name" value={product.name}/><Select name="category_id" label="Category" records={categories} value={product.category_id}/></BusinessForm></details>
          </article>)}
        </section>
        <aside className="setup-column" aria-label="Menu setup forms">
          <section className="panel"><h2>Categories</h2><p className="hint">{categories.length ? categories.map((category) => category.name).join(" · ") : "Create a category to organize your products."}</p>
            <MutationForm action={createCategory} submitLabel="Create category"><label className="field">Category name<input name="name" required maxLength={120} /></label></MutationForm>
            {categories.map(category=><details key={category.id}><summary>Rename {category.name}</summary><BusinessForm module="settings" action="rename_category" label="Rename category" id={category.id}><Field name="name" label="Category name" value={category.name}/></BusinessForm></details>)}
          </section>
          <section className="panel" id="create-product"><h2>Create a product</h2>
            <MutationForm action={createProduct} submitLabel="Create product" disabled={!categories.length}>
              <label className="field">Category<select name="category_id" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label className="field">Product name<input name="product_name" required maxLength={120} /></label>
              <label className="field">First variant or size<input name="variant_name" required maxLength={120} /></label>
              <label className="field">Selling price (PHP)<input name="price" inputMode="decimal" required maxLength={17} /></label>
            </MutationForm>
            {!categories.length && <p className="hint">Create a category first.</p>}
          </section>
        </aside>
      </div>
    </div>
  </main>;
}


