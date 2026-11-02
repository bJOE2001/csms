import { describe, expect, it } from "vitest";
import { salesCsv, type SalesReport } from "./csv";
import type { Sale } from "./domain";

const base: Sale = {
  id: "receipt-a",
  created_at: "2026-11-01T20:00:00Z",
  total_cents: 14500,
  total_cost_cents: 5000,
  method: "cash",
  status: "completed",
  tendered_cents: 20000,
  refund_reason: null,
  payment_status: "confirmed",
  items: [],
};
const report: SalesReport = {
  shopName: "Coffee, Manila",
  timezone: "Asia/Manila",
  from: "2026-11-02",
  to: "2026-11-02",
  sales: [
    base,
    {
      ...base,
      id: "receipt-b",
      status: "refunded",
      total_cents: 5000,
      total_cost_cents: 2000,
    },
    { ...base, id: "receipt-c", status: "cancelled", total_cost_cents: null },
  ],
  expenses: [
    {
      id: "expense-a",
      description: "Electricity",
      spent_on: "2026-11-02",
      amount_cents: 2000,
      voided: false,
    },
    {
      id: "expense-b",
      description: "Duplicate",
      spent_on: "2026-11-02",
      amount_cents: 10000,
      voided: true,
    },
  ],
};

describe("sales CSV export", () => {
  it("exports the saved size label alongside the immutable item name", () => {
    const csv = salesCsv("sales", {
      ...report,
      sales: [
        {
          ...base,
          items: [
            {
              name: "Latte",
              size_label: "16 oz",
              quantity: 1,
              unit_price_cents: 14500,
              line_total_cents: 14500,
            },
          ],
        },
      ],
    });
    expect(csv).toContain("1 × Latte (16 oz)");
  });
  it("matches the displayed profit, including consumed refund costs and voided expenses", () => {
    const csv = salesCsv("summary", report);
    expect(csv).toContain('"Sales revenue","145.00","PHP"');
    expect(csv).toContain('"Product costs","70.00","PHP"');
    expect(csv).toContain('"Gross profit","75.00","PHP"');
    expect(csv).toContain('"Operating expenses","20.00","PHP"');
    expect(csv).toContain('"Net profit","55.00","PHP"');
    expect(csv).toContain('"Completed sales","1","sales"');
    const rows = salesCsv("sales", report).split("\r\n");
    expect(rows[1]).toContain(
      '"2026-11-01T20:00:00Z","2026-11-02","completed"',
    );
    expect(rows[2]).toContain('"50.00","0.00","20.00","-20.00","Recorded"');
    expect(rows[3]).toContain('"145.00","0.00","0.00","0.00","Excluded"');
    expect(salesCsv("expenses", report)).toContain('"Voided","100.00","0.00"');
  });
  it("leaves unknown profits and costs blank while preserving explicit zero costs and losses", () => {
    const missing = { ...report, sales: [{ ...base, total_cost_cents: null }] };
    expect(salesCsv("summary", missing)).toContain(
      '"Gross profit","","PHP","Incomplete: 1 sale(s) missing cost"',
    );
    expect(salesCsv("summary", missing)).toContain(
      '"Net profit","","PHP","Incomplete: 1 sale(s) missing cost"',
    );
    expect(salesCsv("summary", missing)).toContain(
      '"Gross margin","","%","Incomplete: 1 sale(s) missing cost"',
    );
    expect(salesCsv("summary", { ...report, sales: [] })).toContain(
      '"Net margin","","%"',
    );
    expect(salesCsv("sales", missing)).toContain(
      '"145.00","145.00","","","Incomplete: cost missing"',
    );
    expect(
      salesCsv("sales", {
        ...report,
        sales: [{ ...base, total_cost_cents: 0 }],
      }),
    ).toContain('"145.00","145.00","0.00","145.00","Recorded"');
    expect(salesCsv("summary", { ...report, sales: [] })).toContain(
      '"Net profit","-20.00","PHP"',
    );
  });
  it("preserves Unicode, commas, quotes and newlines, neutralizes formula text and keeps negative amounts numeric", () => {
    const csv = salesCsv("expenses", {
      ...report,
      shopName: "=1+1",
      expenses: [
        {
          ...report.expenses[0],
          description: '\t=HYPERLINK("bad")\nCafé, milk',
        },
      ],
    });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"\'\t=HYPERLINK(""bad"")\nCafé, milk"');
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(salesCsv("summary", { ...report, sales: [] })).toContain(
      '"Net profit","-20.00"',
    );
  });
  it("produces useful empty reports with headers and rejects unsafe numeric amounts", () => {
    expect(salesCsv("sales", { ...report, sales: [] })).toContain(
      '"Receipt ID"',
    );
    expect(
      salesCsv("summary", { ...report, sales: [], expenses: [] }),
    ).toContain('"Net profit","0.00","PHP"');
    expect(() =>
      salesCsv("sales", { ...report, sales: [{ ...base, total_cents: NaN }] }),
    ).toThrow("report amount");
  });
});
