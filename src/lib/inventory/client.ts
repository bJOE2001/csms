import type { InventoryData } from "./domain";
import { publishMenuUpdate } from "../menu/use-catalog";
export async function readInventory(from?: string, to?: string, signal?: AbortSignal): Promise<InventoryData> {
  const response = await fetch(`/api/inventory${from && to ? `?from=${from}&to=${to}` : ""}`, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Inventory could not load.");
  return result.data;
}
export async function saveInventory(action: "item" | "stock" | "recipe" | "return", data: unknown) {
  const response = await fetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, data }) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "Inventory could not be saved. Retry with the same details.");
  publishMenuUpdate();
  return result.data;
}
