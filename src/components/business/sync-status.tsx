"use client";
import{useEffect,useState}from "react";
import{getSavedSession,queueFor}from "@/lib/pos/storage";
export function SyncStatus({userId,shopId}:{userId:string;shopId:string}){
  const[status,setStatus]=useState("Checking this browser's queue…");
  useEffect(()=>{let active=true;const update=async()=>{try{const session=await getSavedSession();if(!session||session.user_id!==userId||session.shop_id!==shopId){if(active)setStatus("No POS session saved for this account on this browser.");return;}const orders=await queueFor(session);if(active)setStatus(`${orders.filter(o=>o.status==="pending").length} pending · ${orders.filter(o=>o.status==="failed").length} failed · ${orders.filter(o=>o.status==="synced").length} server-confirmed on this browser.`);}catch{if(active)setStatus("Local queue status unavailable. Open POS to review browser storage.");}};void update();const timer=setInterval(()=>void update(),10000);addEventListener("storage",update);return()=>{active=false;clearInterval(timer);removeEventListener("storage",update);};},[userId,shopId]);
  return <p className="hint" role="status">Local synchronization: {status}</p>;
}
