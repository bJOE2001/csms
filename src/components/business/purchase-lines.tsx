"use client";
import { useState } from "react";
import { text,type Row } from "@/lib/business/data";

export function PurchaseLines({ingredients}:{ingredients:Row[]}) {
  const [lines,setLines]=useState([{ingredient_id:"",quantity:"",unit_cost_php:""}]);
  const change=(index:number,key:"ingredient_id"|"quantity"|"unit_cost_php",value:string)=>setLines(lines.map((line,i)=>i===index?{...line,[key]:value}:line));
  return <><input type="hidden" name="items_json" value={JSON.stringify(lines)}/>{lines.map((line,index)=><fieldset className="recipe-line" key={index}><legend>Purchase line {index+1}</legend><label className="field">Ingredient<select value={line.ingredient_id} onChange={e=>change(index,"ingredient_id",e.target.value)} required><option value="" disabled>Select ingredient</option>{ingredients.map(i=><option key={text(i,"id")} value={text(i,"id")}>{text(i,"name")} ({text(i,"base_unit")})</option>)}</select></label><label className="field">Quantity in base units<input inputMode="decimal" value={line.quantity} onChange={e=>change(index,"quantity",e.target.value)} required/></label><label className="field">PHP per base unit<input inputMode="decimal" value={line.unit_cost_php} onChange={e=>change(index,"unit_cost_php",e.target.value)} required/></label>{lines.length>1&&<button type="button" className="text-button" onClick={()=>setLines(lines.filter((_,i)=>i!==index))}>Remove line {index+1}</button>}</fieldset>)}<button className="button secondary" type="button" disabled={lines.length>=100} onClick={()=>setLines([...lines,{ingredient_id:"",quantity:"",unit_cost_php:""}])}>Add purchase line</button></>;
}
