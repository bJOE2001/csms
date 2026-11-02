"use client";
import Dexie,{type Table} from "dexie";
import {orderPayloadSchema,posSessionSchema,queueExportSchema,type OrderPayload,type PosSession} from "./domain";
export type QueueOrder={id:string;scope:string;payload:OrderPayload;status:"pending"|"failed"|"synced";attempts:number;error:string;result?:unknown};
type SavedSession={scope:string;session:PosSession;sequence:number};
class PosDatabase extends Dexie {
  sessions!:Table<SavedSession,string>;orders!:Table<QueueOrder,string>;
  constructor(){super("csms-pos-v1");this.version(1).stores({sessions:"&scope",orders:"&id,scope,status"});}
}
let database:PosDatabase|undefined;
export const posDatabase=()=>database??=new PosDatabase();
export const scopeOf=(s:PosSession)=>`${s.user_id}:${s.shop_id}:${s.device_id}`;
export async function saveSession(session:PosSession){const s=posSessionSchema.parse(session),scope=scopeOf(s),db=posDatabase();await db.transaction("rw",db.sessions,db.orders,async()=>{const previous=await db.sessions.get(scope);if(previous&&previous.session.id!==s.id&&(await db.orders.where("scope").equals(scope).toArray()).some(o=>o.status!=="synced"))throw new Error("Resolve/export the previous shift queue before opening another session.");await db.sessions.put({scope,session:s,sequence:previous?.session.id===s.id?Math.max(previous.sequence,s.server_sequence):s.server_sequence});});localStorage.setItem("csms-pos-scope",scope);}
export async function getSavedSession(){const scope=localStorage.getItem("csms-pos-scope");return scope?(await posDatabase().sessions.get(scope))?.session:undefined;}
export async function enqueueOrder(session:PosSession,draft:Omit<OrderPayload,"sequence"|"session_id"|"created_at">){const db=posDatabase(),scope=scopeOf(session);return db.transaction("rw",db.sessions,db.orders,async()=>{const saved=await db.sessions.get(scope);if(!saved||saved.session.id!==session.id)throw new Error("Reload the POS session.");const payload=orderPayloadSchema.parse({...draft,session_id:session.id,sequence:saved.sequence+1,created_at:new Date().toISOString()});const row:QueueOrder={id:crypto.randomUUID(),scope,payload,status:"pending",attempts:0,error:""};await db.orders.add(row);await db.sessions.update(scope,{sequence:payload.sequence});return row;});}
export async function queueFor(session:PosSession){return(await posDatabase().orders.where("scope").equals(scopeOf(session)).toArray()).sort((a,b)=>a.payload.sequence-b.payload.sequence);}
export async function updateQueued(id:string,patch:Partial<Pick<QueueOrder,"status"|"attempts"|"error"|"result">>){await posDatabase().orders.update(id,patch);}
export async function exportQueue(session:PosSession){return{version:1 as const,session,orders:(await queueFor(session)).filter(o=>o.status!=="synced").map(({id,payload})=>({id,payload}))};}
export async function importQueue(raw:unknown,current:PosSession){
  const parsed=queueExportSchema.parse(raw);
  if(parsed.session.shop_id!==current.shop_id||(!current.founder&&parsed.session.user_id!==current.user_id))throw new Error("A founder must recover another cashier's queue in the same shop.");
  const db=posDatabase(),scope=scopeOf(current);
  await db.transaction("rw",db.orders,db.sessions,async()=>{
    const saved=await db.sessions.get(scope);let sequence=saved?.sequence??current.server_sequence;
    for(const row of parsed.orders){
      const existing=await db.orders.get(row.id);
      if(existing&&JSON.stringify(existing.payload)!==JSON.stringify(row.payload))throw new Error("A recovery identifier has conflicting data.");
      if(!existing)await db.orders.add({...row,scope,status:"failed",attempts:0,error:"Recovered queue: founder review required."});
      else if(existing.status!=="synced"&&current.founder)await db.orders.update(row.id,{scope});
      if(row.payload.session_id===current.id)sequence=Math.max(sequence,row.payload.sequence);
    }
    // Recovery and the sequence watermark commit together; the next checkout
    // cannot reuse a sequence restored from an unsynchronized recovery file.
    if(saved)await db.sessions.update(scope,{sequence});
  });
}
