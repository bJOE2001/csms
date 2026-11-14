"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShopData } from "@/lib/menu/domain";
import { listSales, scopeFor, type QueuedSale } from "./offline-store";
import { syncOfflineSales } from "./sync";
import { notify } from "@/lib/notify";

export function useOutbox(data: ShopData | undefined, offline: boolean, refreshCatalog: () => Promise<boolean>) {
  const [sales, setSales] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const version = useRef(0);
  const invalidate = useCallback(() => { version.current++; }, []);
  const scope = data ? scopeFor(data) : "";
  const identity = useRef(data);
  identity.current = data;
  const refresh = useCallback(async () => {
    const id = ++version.current;
    try {
      const next = scope ? await listSales(scope) : [];
      if (id === version.current) setSales(next);
    } catch (e) { setError((e as Error).message); }
  }, [scope]);
  const sync = useCallback(async () => {
    if (working.current || !identity.current || !navigator.onLine) return;
    working.current = true;
    setSyncing(true);
    setError("");
    try {
      const count = await syncOfflineSales(identity.current);
      if (count) {
        notify.success("Offline sales synced", { description: `${count} ${count === 1 ? "receipt saved" : "receipts saved"} to production.` });
        await refreshCatalog();
      }
    } catch (e) { setError((e as Error).message); }
    finally { working.current = false; setSyncing(false); await refresh(); }
  }, [refresh, refreshCatalog]);
  useEffect(() => {
    void refresh();
    const onStorage = (event: StorageEvent) => { if (event.key === "sip-snap-pos-change") void refresh(); };
    window.addEventListener("pos-offline-changed", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      invalidate();
      window.removeEventListener("pos-offline-changed", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, invalidate]);
  useEffect(() => {
    if (!scope) return;
    if (!offline) void sync();
    const retry = async () => {
      if (document.visibilityState === "visible") {
        await refreshCatalog();
        await sync();
      }
    };
    const timer = window.setInterval(retry, 30000);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [scope, offline, sync, refreshCatalog]);
  function exportSales() {
    const contents = { format: "sip-snap-unsynced-sales-v1", exported_at: new Date().toISOString(), shop_id: data?.shop.id, user_id: data?.user_id, sales };
    const url = URL.createObjectURL(new Blob([JSON.stringify(contents, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `unsynced-sales-${data?.shop.id}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { sales, syncing, sync, error, refresh, exportSales };
}
