import Link from "next/link";
import { BusinessForm, Field, Select } from "./forms";
import { money, rows, text, type Row } from "@/lib/business/data";

const quantity = (value: unknown) => String(value ?? "0").replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");

export function Inventory({ data }: { data: Row }) {
  const ingredients = rows(data.ingredients), balances = rows(data.inventory_balances), movements = rows(data.stock_movements);
  return <div className="management-layout"><section>
    <section className="panel"><div className="stock-summary"><div><h2>Recorded stock</h2><p>{ingredients.length} ingredients · Counts and deliveries update these balances</p></div><Link className="inline-link" href="#stock-actions">Update stock ↓</Link></div>
      {!ingredients.length ? <div className="empty-state"><h3>Add your first ingredient</h3><p>Create ingredients and choose their base units before recording stock.</p><Link className="button secondary" href="/app/recipes">Set up ingredients</Link></div> : <div className="table-scroll"><table aria-label="Recorded ingredient stock"><thead><tr><th>Ingredient</th><th>On hand</th><th>Stock value</th><th>Status</th></tr></thead><tbody>{ingredients.map(ingredient => {
        const balance = balances.find(balance => balance.ingredient_id === ingredient.id);
        const amount = quantity(balance?.quantity), low = Number(amount) <= Number(ingredient.minimum_stock);
        return <tr key={text(ingredient, "id")}><td><strong>{text(ingredient, "name")}</strong><br/><small>Reorder at {quantity(ingredient.minimum_stock)} {text(ingredient, "base_unit")}</small></td><td>{amount} <small>{text(ingredient, "base_unit")}</small></td><td>{money(balance?.value_cents)}</td><td><span className={`status${low ? " warning" : ""}`}>{!balance ? "Not counted" : low ? "Low stock" : "Recorded"}</span></td></tr>;
      })}</tbody></table></div>}
      <p className="hint">Balances use moving weighted average costs. Check your shelves regularly; recorded stock can differ from a physical count.</p>
    </section>
    <details className="panel"><summary>Recent stock movements <span className="count">{movements.length} shown</span></summary>{!movements.length && <p className="hint">Your first count or delivery will appear here.</p>}{movements.map(movement => <article className="ledger-row" key={text(movement,"id")}><strong>{text(movement,"kind")} · {quantity(movement.quantity_delta)} {text(ingredients.find(ingredient => ingredient.id === movement.ingredient_id) ?? {},"base_unit")}</strong><p>{text(ingredients.find(ingredient => ingredient.id === movement.ingredient_id) ?? {},"name")} · {text(movement,"reason")}</p><small>{text(movement,"created_at")} · value {money(movement.value_delta_cents)}</small></article>)}</details>
  </section><aside className="panel action-panel" id="stock-actions"><h2>Update stock</h2><p className="hint">Choose the action that matches what happened.</p>
    <details open={!balances.length}><summary>Record opening stock</summary><p className="hint">Your first physical count. This can be entered once per ingredient.</p><BusinessForm module="inventory" action="opening" label="Record opening stock"><Select name="ingredient_id" label="Ingredient" records={ingredients}/><Field name="quantity" label="Opening quantity" inputMode="decimal"/><Field name="value_php" label="Total actual opening value (PHP, optional)" inputMode="decimal" required={false}/><Field name="reason" label="Source / reason"/></BusinessForm></details>
    <details open={balances.length > 0}><summary>Record a physical count</summary><p className="hint">Enter what you counted. The system records the difference from the current balance.</p><BusinessForm module="inventory" action="count" label="Record physical count"><Select name="ingredient_id" label="Ingredient" records={ingredients}/><Field name="quantity" label="Physical quantity counted (base units)" inputMode="decimal"/><Field name="value_php" label="Full counted stock value (PHP, optional)" inputMode="decimal" required={false}/><Field name="reason" label="Count reason"/></BusinessForm></details>
    <details><summary>Record wastage</summary><p className="hint">Log ingredients that were spoiled, spilled or otherwise lost.</p><BusinessForm module="inventory" action="waste" label="Record wastage"><Select name="ingredient_id" label="Ingredient" records={ingredients}/><Field name="quantity" label="Quantity wasted" inputMode="decimal"/><Field name="reason" label="Reason"/></BusinessForm></details>
    <p className="hint">A delivery arrived? <Link className="inline-link" href="/app/purchases">Receive it in Purchases →</Link></p>
  </aside></div>;
}
