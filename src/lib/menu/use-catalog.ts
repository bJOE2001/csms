"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBeginLoading } from "@/components/ui/global-loading-bar";
import type { ShopData } from "./domain";

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
export function useCatalog() {
  const [data, setData] = useState<ShopData>();
  const [error, setError] = useState("");
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
      const response = await fetch("/api/pos", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (id === request.current) {
        setData({ ...result, categories: result.categories ?? [] });
        setError("");
      }
      return true;
    } catch (error) {
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
  }, [begin]);
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
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      cancelCurrent();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh, cancelCurrent]);
  return { data, error, refresh, isLoading };
}
