import { paymentMethodLabel, type Sale } from "./domain";

export type ReceiptPaperWidth = "80" | "58";
export type ReceiptBusinessDetails = { address?: string; phone?: string };
export type CustomerReceipt = ReturnType<typeof customerReceipt>;

/** Explicit customer allowlist: costs, owner notes and refund reasons never cross this boundary. */
export function customerReceipt(sale: Sale, timezone: string) {
  const date = new Date(sale.created_at);
  const items = sale.items.map(item => ({
    name: item.name, size: item.size_label || undefined, quantity: item.quantity,
    unitPrice: item.unit_price_cents, amount: item.line_total_cents,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const hasSubtotal = items.length > 0 && Number.isSafeInteger(subtotal);
  const cashRecorded = sale.method === "cash" && sale.tendered_cents !== null && sale.tendered_cents >= sale.total_cents;
  const status = sale.status === "completed" ? "Completed" : sale.status === "refunded" ? "Refunded" : sale.status === "cancelled" ? "Cancelled" : sale.status;
  const refundedAt = sale.refunded_at ? new Date(sale.refunded_at) : null;
  return {
    number: sale.id.slice(0, 8).toUpperCase(), reference: sale.id,
    createdAt: sale.created_at,
    date: new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: timezone }).format(date),
    time: new Intl.DateTimeFormat("en-PH", { timeStyle: "short", timeZone: timezone }).format(date),
    status, reversed: sale.status === "refunded" || sale.status === "cancelled",
    refunded: sale.status === "refunded", items,
    refundedOn: sale.status === "refunded" && refundedAt && Number.isFinite(refundedAt.getTime())
      ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(refundedAt) : null,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: hasSubtotal ? subtotal : null,
    // A legacy receipt may have a stored total different from its item sum. Do not invent a tax or discount type.
    adjustment: hasSubtotal && subtotal !== sale.total_cents ? sale.total_cents - subtotal : null,
    total: sale.total_cents, method: paymentMethodLabel(sale.method),
    paymentStatus: sale.payment_status === "unknown" ? "Not recorded" : sale.payment_status,
    cash: cashRecorded ? { received: sale.tendered_cents!, change: sale.tendered_cents! - sale.total_cents } : null,
  };
}
