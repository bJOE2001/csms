"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ShopData } from "./domain";

const updateKey = "coffee-menu-updated";
export function publishMenuUpdate() {
  try {
    localStorage.setItem(updateKey, String(Date.now()));
  } catch {
    /* Focus refresh remains available. */
  }
}
export async function saveMenu(action: string, shopId: string, data: unknown) {
  const response = await fetch("/api/pos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, shop_id: shopId, data }),
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
  const refresh = useCallback(async () => {
    const id = ++request.current;
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
    }
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
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);
  return { data, error, refresh };
}
