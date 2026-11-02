import { PurchaseLines } from "./purchase-lines";
import { BusinessForm, Field, Options, Select } from "./forms";
import { rows, text, type Row } from "@/lib/business/data";

export { Inventory } from "./stock";

export function Purchases({ data }: { data: Row }) {
  const suppliers=rows(data.suppliers),ingredients=rows(data.ingredients),items=rows(data.purchase_items);
  return <div className="management-layout"><section><h2>Purchase records</h2><p className="hint">Plans and orders add no stock. Record only the quantities physically received. Enter inventory payments separately as classified expenses.</p>
    {!rows(data.purchases).length && <p className="empty-state">No purchases recorded. Add a supplier and create a plan.</p>}
    {rows(data.purchases).map(p => <article className="panel" key={text(p,"id")}><div className="section-heading"><h3>{text(suppliers.find(s=>s.id===p.supplier_id)??{},"name")}</h3><span className="status">{text(p,"status")}</span></div><p className="hint">{text(p,"reference") || text(p,"id")}</p>{items.filter(i=>i.purchase_id===p.id).map(i=><section className="variant-row" key={text(i,"id")}><strong>{text(ingredients.find(v=>v.id===i.ingredient_id)??{},"name")}</strong><p className="hint">{text(i,"received_quantity")} / {text(i,"quantity")} received · PHP {(Number(i.unit_cost_cents)/100).toFixed(4)} per base unit</p>{["ordered","partial"].includes(text(p,"status"))&&Number(i.received_quantity)<Number(i.quantity)&&<BusinessForm module="inventory" action="receive" label="Receive this quantity" values={{purchase_id:text(p,"id"),item_id:text(i,"id")}}><Field name="quantity" label="Quantity received now" inputMode="decimal" /></BusinessForm>}</section>)}
      {text(p,"status")==="planned"&&<BusinessForm module="inventory" action="purchase_status" label="Mark ordered" id={text(p,"id")} values={{status:"ordered"}} />}
      {["planned","ordered"].includes(text(p,"status"))&&<details><summary>Cancel unreceived purchase</summary><BusinessForm module="inventory" action="purchase_status" label="Cancel purchase" id={text(p,"id")} values={{status:"cancelled"}} /></details>}
    </article>)}
    <h2>Suppliers</h2>{suppliers.map(s=><article className="panel" key={text(s,"id")}><h3>{text(s,"name")}</h3><p>{text(s,"contact")}</p><details><summary>Edit supplier</summary><BusinessForm module="inventory" action="supplier" label="Save supplier" id={text(s,"id")}><Field name="name" label="Supplier name" value={text(s,"name")} /><Field name="contact" label="Contact details" value={text(s,"contact")} required={false}/><Options name="active" label="Active" values={["true","false"]} value={String(s.active)}/></BusinessForm></details></article>)}
  </section><aside><section className="panel"><h2>Create supplier</h2><BusinessForm module="inventory" action="supplier" label="Create supplier"><Field name="name" label="Supplier name"/><Field name="contact" label="Contact details" required={false}/></BusinessForm></section><section className="panel" id="purchase-create"><h2>Create purchase</h2><p className="hint">Quantities and prices use the ingredient base unit. Add each ingredient as a separate line.</p><BusinessForm module="inventory" action="purchase" label="Create purchase"><Select name="supplier_id" label="Supplier" records={suppliers.filter(s=>s.active)}/><PurchaseLines ingredients={ingredients}/><Field name="reference" label="Supplier reference" required={false}/><Options name="status" label="Initial status" values={["planned","ordered"]}/><label className="field">Supporting receipt<input type="file" name="document" accept="application/pdf,image/png,image/jpeg"/></label></BusinessForm></section></aside></div>;
}


