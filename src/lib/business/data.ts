import type { Json } from "@/lib/supabase/database.types";
import { asCents, formatPhp } from "@/lib/money";

export type Row = { [key: string]: Json | undefined };
export function object(value: Json | undefined): Row { return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {}; }
export function rows(value: Json | undefined): Row[] { return Array.isArray(value) ? value.map(object) : []; }
export function text(row: Row, key: string): string { const value = row[key]; return typeof value === "string" || typeof value === "number" ? String(value) : ""; }
export function money(value: Json | undefined): string {
  if (value === null || value === undefined) return "Not recorded";
  const n = Number(value);
  return n < 0 ? `−${formatPhp(asCents(-n))}` : formatPhp(asCents(n));
}
export function localDate(iso: string, timezone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(iso));
}
