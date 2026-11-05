import { expect, it } from "vitest";
import { customerReceipt } from "./receipt";
import type { Sale } from "./domain";

const sale: Sale = {
  id: "74a96ee5-921a-4cd6-86b1-ccff156a9931", created_at: "2026-11-01T17:00:00Z",
  total_cents: 14500, method: "cash", status: "completed", payment_status: "confirmed", tendered_cents: 20000,
  total_cost_cents: 5000, cost_note: "Private cost source", refund_reason: "Private refund note",
  items: [{ name: "Historical Latte", size_label: "Custom 16 oz", quantity: 1, unit_price_cents: 14500, line_total_cents: 14500 }],
};
it("projects immutable receipt fields, Manila dates and exact cash values without internal information", () => {
  const receipt = customerReceipt(sale, "Asia/Manila");
  expect(receipt).toMatchObject({ number: "74A96EE5", reference: sale.id, date: "Nov 2, 2026", time: "1:00 AM", total: 14500, subtotal: 14500, adjustment: null, cash: { received: 20000, change: 5500 } });
  expect(receipt.items[0]).toMatchObject({ name: "Historical Latte", size: "Custom 16 oz", unitPrice: 14500 });
  expect(JSON.stringify(receipt)).not.toMatch(/cost|Private|reason/);
});
it("labels legacy wallet payments consistently and never invents cash or an external payment reference", () => {
  const receipt = customerReceipt({ ...sale, method: "gcash" }, "Asia/Manila");
  expect(receipt.method).toBe("E-wallet");
  expect(receipt.cash).toBeNull();
  expect(receipt).not.toHaveProperty("paymentReference");
  expect(customerReceipt({ ...sale, tendered_cents: null }, "Asia/Manila").cash).toBeNull();
});
it("preserves legacy adjustments and refunds without inventing tax or discount types", () => {
  const receipt = customerReceipt({ ...sale, total_cents: 14000, status: "refunded", payment_status: "refunded", refunded_at: "2026-11-02T10:00:00Z" }, "Asia/Manila");
  expect(receipt).toMatchObject({ subtotal: 14500, adjustment: -500, total: 14000, refunded: true, status: "Refunded", paymentStatus: "refunded" });
  expect(receipt.refundedOn).toBe("Nov 2, 2026, 6:00 PM");
  expect(receipt).not.toHaveProperty("tax");
  expect(receipt).not.toHaveProperty("discount");
  expect(customerReceipt({ ...sale, items: [] }, "Asia/Manila").subtotal).toBeNull();
});
