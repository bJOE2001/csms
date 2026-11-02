import { z } from "zod";

const cents=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const menuItemSchema=z.object({variant_id:z.uuid(),product_name:z.string(),variant_name:z.string(),category:z.string(),price_id:z.uuid(),price_cents:cents,recipe_id:z.uuid()});
export const posSessionSchema=z.object({id:z.uuid(),shop_id:z.uuid(),user_id:z.uuid(),device_id:z.uuid(),shift_id:z.uuid(),expires_at:z.iso.datetime({offset:true}),offline_capable:z.boolean(),founder:z.boolean(),server_sequence:z.number().int().nonnegative(),menu:z.array(menuItemSchema).max(1000),settings:z.object({name:z.string(),timezone:z.string(),address:z.string(),receipt_footer:z.string(),methods:z.array(z.string()),max_discount_bps:z.number().int()})});
export type PosSession=z.infer<typeof posSessionSchema>;
export const orderPayloadSchema=z.object({session_id:z.uuid(),sequence:z.number().int().min(1).max(1000000),order_type:z.enum(["dine_in","takeout"]),table_label:z.string().max(40),items:z.array(z.object({variant_id:z.uuid(),quantity:z.number().int().min(1).max(100)}).strict()).min(1).max(100),discount_cents:cents,method:z.string().min(1).max(80),tendered_cents:cents.nullable(),reference:z.string().max(120),created_at:z.iso.datetime()}).strict().refine(v=>new Set(v.items.map(i=>i.variant_id)).size===v.items.length,"Combine duplicate variants.");
export type OrderPayload=z.infer<typeof orderPayloadSchema>;
export function cartTotal(items:{variant_id:string;quantity:number}[],menu:PosSession["menu"]):number {
  let result=0n;
  for(const item of items){const variant=menu.find(v=>v.variant_id===item.variant_id);if(!variant||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>100)throw new Error("Invalid cart item.");result+=BigInt(variant.price_cents)*BigInt(item.quantity);}
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new Error("Cart exceeds supported amount.");return Number(result);
}
export function canCheckoutOffline(session:PosSession,now:number,online:boolean,locked:boolean):boolean {return !locked&&now<=Date.parse(session.expires_at)&&(online||session.offline_capable);}
export const queueExportSchema=z.object({version:z.literal(1),session:posSessionSchema,orders:z.array(z.object({id:z.uuid(),payload:orderPayloadSchema})).max(10000)});
