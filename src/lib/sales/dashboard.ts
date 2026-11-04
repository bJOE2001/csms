import { summarize, type Sale, type Expense } from "./domain";
import { dateRangeError, shopDate } from "./period";

const dayMs = 86_400_000;
const stamp = (date: string) => new Date(`${date}T00:00:00Z`).getTime();
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
export function previousPeriod(from: string, to: string) {
  const days = Math.round((stamp(to) - stamp(from)) / dayMs) + 1;
  return { from: iso(stamp(from) - days * dayMs), to: iso(stamp(from) - dayMs) };
}
export type Performance = { name: string; quantity: number; revenue: number };
export type SalesPoint = { label: string; cents: number };

/** Allocate receipt-level discounts in cents, retaining the exact receipt total. */
export function itemNetRevenue(sale: Sale): number[] {
  const gross = sale.items.reduce((sum, item) => sum + item.line_total_cents, 0);
  if (gross === sale.total_cents) return sale.items.map(item => item.line_total_cents);
  if (gross === 0) return sale.items.map(() => 0);
  const denominator = BigInt(gross), total = BigInt(sale.total_cents);
  const shares = sale.items.map((item, index) => {
    const numerator = BigInt(item.line_total_cents) * total;
    return { index, cents: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let remaining = sale.total_cents - shares.reduce((sum, share) => sum + share.cents, 0);
  const priority = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const share of priority) { if (remaining-- <= 0) break; share.cents++; }
  return shares.map(share => share.cents);
}

/** Aggregate immutable receipt snapshots on the server; never use current menu prices. */
export function buildDashboard(sales: Sale[], expenses: Expense[], from: string, to: string, timezone: string, previous: Sale[] | null = null) {
  const error = dateRangeError(from, to);
  if (error) throw new Error(error);
  const days = Math.round((stamp(to) - stamp(from)) / dayMs) + 1;
  const granularity = days === 1 ? "Hourly" : days <= 45 ? "Daily" : days <= 180 ? "Weekly" : "Monthly";
  const slots = new Map<string, SalesPoint>();
  const dayLabel = (day: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  const slotKey = (day: string) => granularity === "Monthly" ? day.slice(0, 7) : granularity === "Weekly" ? iso(stamp(from) + Math.floor((stamp(day) - stamp(from)) / dayMs / 7) * 7 * dayMs) : day;
  if (days === 1) {
    for (let hour = 0; hour < 24; hour++) slots.set(String(hour), { label: `${dayLabel(from)} · ${String(hour).padStart(2, "0")}:00`, cents: 0 });
  } else {
    for (let date = stamp(from); date <= stamp(to); date += dayMs) {
      const day = iso(date), key = slotKey(day);
      if (slots.has(key)) continue;
      const end = iso(Math.min(date + 6 * dayMs, stamp(to)));
      const label = granularity === "Monthly"
        ? new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date))
        : granularity === "Weekly" ? `${dayLabel(day)} – ${dayLabel(end)}` : dayLabel(day);
      slots.set(key, { label, cents: 0 });
    }
  }
  const products = new Map<string, Performance>(), sizes = new Map<string, Performance>();
  const add = (map: Map<string, Performance>, key: string, name: string, quantity: number, revenue: number) => {
    const value = map.get(key) ?? { name, quantity: 0, revenue: 0 };
    value.quantity += quantity; value.revenue += revenue; map.set(key, value);
  };
  const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone });
  for (const sale of sales) {
    if (sale.status !== "completed") continue;
    const date = shopDate(timezone, new Date(sale.created_at));
    const key = days === 1 ? String(Number(hour.format(new Date(sale.created_at)))) : slotKey(date);
    const point = slots.get(key);
    if (point) point.cents += sale.total_cents;
    const revenues = itemNetRevenue(sale);
    for (const [index, item] of sale.items.entries()) {
      add(products, item.name, item.name, item.quantity, revenues[index]);
      const size = item.size_label?.trim() || "No size recorded";
      add(sizes, size, size, item.quantity, revenues[index]);
    }
  }
  const rank = (map: Map<string, Performance>) => [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name)).slice(0, 5);
  const summary = summarize(sales, expenses);
  const before = previous === null ? null : summarize(previous);
  return {
    summary, granularity, series: [...slots.values()], products: rank(products), sizes: rank(sizes),
    unattributedSales: sales.filter(s => s.status === "completed" && s.total_cents > 0 && !s.items.some(item => item.line_total_cents > 0)).length,
    reversed: sales.filter(s => s.status !== "completed").length,
    recent: [...sales].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0, 5),
    comparison: before && before.orders > 0 && before.total > 0 ? { percent: (summary.total - before.total) / before.total * 100, ...previousPeriod(from, to) } : null,
  };
}
export type DashboardReport = ReturnType<typeof buildDashboard>;
