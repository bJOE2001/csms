import type { ReactNode } from "react";
import { MutationForm } from "@/components/mutation-form";
import { businessAction } from "@/app/app/business-actions";
import { text, type Row } from "@/lib/business/data";

export function BusinessForm({ module, action, label, children, id, values = {} }: { module: string; action: string; label: string; children?: ReactNode; id?: string; values?: Record<string, string> }) {
  return <MutationForm action={businessAction} submitLabel={label}>
    <input type="hidden" name="module" value={module} /><input type="hidden" name="action" value={action} />
    <input type="hidden" name="operation_id" value={crypto.randomUUID()} />
    {id && <input type="hidden" name="id" value={id} />}
    {Object.entries(values).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
    {children}
  </MutationForm>;
}
export function Field({ name, label, type = "text", value, required = true, ...props }: { name: string; label: string; type?: string; value?: string; required?: boolean; maxLength?: number; min?: string; max?: string; step?: string; inputMode?: "decimal" | "numeric" }) {
  return <label className="field"><span>{label}{!required&&!label.toLowerCase().includes("optional")&&<small> (optional)</small>}</span><input name={name} type={type} defaultValue={value} required={required} maxLength={500} {...props} /></label>;
}
export function Select({ name, label, records, display = "name", value, extra, required=true }: { name: string; label: string; records: Row[]; display?: string; value?: string; extra?: string; required?:boolean }) {
  return <label className="field">{label}<select name={name} required={required} defaultValue={value ?? ""}><option value="" disabled={required}>{required?`Select ${label.toLowerCase()}`:"No cash refund"}</option>{records.map(row => <option value={text(row, "id") || text(row, "user_id")} key={text(row, "id") || text(row, "user_id")}>{text(row, display) || text(row, "user_id")}{extra ? ` · ${text(row, extra)}` : ""}</option>)}</select></label>;
}
export function Options({ name, label, values, value }: { name: string; label: string; values: string[]; value?: string }) {
  const labels:Record<string,string>={true:"Yes",false:"No",pre_opening:"Pre-opening",operating:"Operating",inventory_asset:"Inventory / stock asset",working_cash:"Working cash",reimbursable:"Reimbursable funding",dine_in:"Dine-in",takeout:"Takeout"};
  return <label className="field">{label}<select name={name} defaultValue={value ?? values[0]}>{values.map(v => <option key={v} value={v}>{labels[v]??v.replaceAll("_", " ").replace(/^./,letter=>letter.toUpperCase())}</option>)}</select></label>;
}
