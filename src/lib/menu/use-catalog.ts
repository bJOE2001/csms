"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBeginLoading } from "@/components/ui/global-loading-bar";
import type { ShopData } from "./domain";
import { CatalogSessionChangedError, deactivateCatalog, markOfflineSignedOut, readActiveCatalog, readCatalogEpoch, saveCatalog, scopeFor } from "@/lib/pos/offline-store";

class CatalogAccessError extends Error {}

const updateKey = "coffee-menu-updated";
export function publishMenuUpdate() {
  try {
    localStorage.setItem(updateKey, String(Date.now()));
  } catch {
    /* Focus refresh remains available. */
  }
}
export async function saveMenu(action: string, shopId: string, data: unknown, image?: File) {
  const payload = JSON.stringify({ action, shop_id: shopId, data });
  const form = image ? new FormData() : undefined;
  if (form) { form.set("payload", payload); form.set("image", image!); }
  const response = await fetch("/api/pos", {
    method: "POST",
    headers: form ? undefined : { "Content-Type": "application/json" },
    body: form ?? payload,
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error ?? "Your changes could not be saved.");
  publishMenuUpdate();
  return result.data;
}
export function useCatalog(options: { offline?: boolean; module?: "pos" | "menu" | "libraries" } = {}) {
  const offlineEnabled = options.offline ?? false;
  const catalogModule = options.module ?? "pos";
  const [data, setData] = useState<ShopData>();
  const catalog = useRef<ShopData | undefined>(undefined);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [storageError, setStorageError] = useState("");
  const request = useRef(0);
  const begin = useBeginLoading();
  const finishCurrent = useRef<() => void>(() => {});
  const [isLoading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    const finish = begin();
    // Superseded work no longer owns the bar; the existing request ID guard
    // still ignores its response without introducing another API request.
    finishCurrent.current();
    finishCurrent.current = finish;
    setLoading(true);
    try {
      let epoch: string | undefined;
      if (offlineEnabled) {
        try { epoch = await readCatalogEpoch(); }
        catch { setStorageError("Device storage is unavailable. Offline sales cannot be saved. Enable browser storage before taking offline payments."); }
      }
      if (offlineEnabled && !navigator.onLine) throw new TypeError("Device is offline.");
      const response = await fetch("/api/pos", { cache: "no-store", headers: { "X-Workspace-Module": catalogModule }, signal: AbortSignal.timeout(10000) });
      if (id !== request.current) return false;
      if (response.status === 401 || response.status === 403) {
        if (offlineEnabled) {
          try { await deactivateCatalog(epoch); }
          catch (error) { if (error instanceof CatalogSessionChangedError) throw error; }
          markOfflineSignedOut();
        }
        if (response.status === 401) {
          window.location.replace("/login");
          return false;
        }
        let message = "Sign in again to open POS. Unsynced sales remain saved.";
        try { message = (await response.json()).error ?? message; } catch { /* An auth rejection is never an offline fallback. */ }
        throw new CatalogAccessError(message);
      }
      const result = await response.json();
      if (id !== request.current) return false;
      if (!response.ok) throw Error(result.error);
      if (id === request.current) {
        const next: ShopData = { ...result, categories: result.categories ?? [] };
        if (offlineEnabled && epoch !== undefined) {
          try {
            await saveCatalog(next, epoch);
            setStorageError("");
            setSavedAt(new Date().toISOString());
          } catch (error) {
            if (error instanceof CatalogSessionChangedError) throw error;
            setStorageError("Device storage is unavailable. Offline sales cannot be saved. Enable browser storage before taking payments.");
          }
        }
        if (id !== request.current) return false;
        catalog.current = next;
        setData(next);
        setOffline(false);
        setError("");
      }
      return true;
    } catch (error) {
      if (error instanceof CatalogAccessError && id === request.current) { catalog.current = undefined; setData(undefined); }
      if (offlineEnabled && !(error instanceof CatalogAccessError) && !(error instanceof CatalogSessionChangedError)) {
        try {
          const cached = await readActiveCatalog();
          if (cached && id === request.current) {
            catalog.current = cached.data;
            setData(cached.data);
            setSavedAt(cached.savedAt);
            setOffline(true);
            setError("");
            return false;
          }
        } catch {
          setStorageError("Device storage could not be opened. Your saved sales have not been deleted.");
        }
      }
      if (offlineEnabled && id === request.current) {
        catalog.current = undefined;
        setData(undefined);
      }
      if (id === request.current)
        setError(
          error instanceof Error
            ? error.message
            : "The menu could not load. Try again.",
        );
      return false;
    } finally {
      finish();
      if (id === request.current) setLoading(false);
    }
  }, [begin, offlineEnabled, catalogModule]);
  const cancelCurrent = useCallback(() => {
    request.current++;
    finishCurrent.current();
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === updateKey) void refresh();
    };
    const onOffline = () => { if (offlineEnabled) setOffline(true); };
    const onIdentityChange = async () => {
      if (!offlineEnabled || !catalog.current) return;
      try {
        const active = await readActiveCatalog();
        if (!active || scopeFor(active.data) !== scopeFor(catalog.current)) {
          cancelCurrent();
          catalog.current = undefined;
          setData(undefined);
          setError("Sign in again to open POS. Unsynced sales remain on this device.");
        }
      } catch { /* The next checkout will report a storage failure. */ }
    };
    const onOfflineStorage = (event: StorageEvent) => {
      if (event.key === "sip-snap-pos-change") void onIdentityChange();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", onOffline);
    window.addEventListener("pos-offline-changed", onIdentityChange);
    window.addEventListener("storage", onOfflineStorage);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelCurrent();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("pos-offline-changed", onIdentityChange);
      window.removeEventListener("storage", onOfflineStorage);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, cancelCurrent, offlineEnabled]);
  return { data, error, refresh, isLoading, offline, savedAt, storageError };
}
