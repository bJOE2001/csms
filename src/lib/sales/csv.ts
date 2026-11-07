import { paymentMethodLabel, summarize, type Sale, type Expense } from "./domain";

export type ExportKind = "summary" | "sales" | "expenses";
export type SalesReport = {
  shopName: string;
  timezone: string;
  from: string;
  to: string;
  sales: Sale[];
  expenses: Expense[];
  stockReturnCredits?: number;
};
type CsvCell = string | number | { cents: number } | null;
const php = (value: number | null): CsvCell =>
  value === null ? null : { cents: value };

function cell(value: CsvCell) {
  let text: string;
  if (value === null) text = "";
  else if (typeof value === "object") {
    if (!Number.isSafeInteger(value.cents))
      throw Error("A report amount is invalid. Refresh Sales and try again.");
    const amount = Math.abs(value.cents);
    text = `${value.cents < 0 ? "-" : ""}${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;
  } else if (typeof value === "number") text = String(value);
  else {
    // Treat user-entered text as text when opened in spreadsheet applications.
    text = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function salesCsv(kind: ExportKind, report: SalesReport): string {
  const summary = summarize(report.sales, report.expenses, report.stockReturnCredits ?? 0);
  let rows: CsvCell[][];
  if (kind === "summary") {
    const incomplete =
      summary.missingCosts > 0
        ? `Incomplete: ${summary.missingCosts} sale(s) missing cost`
        : "All sale costs recorded";
    rows = [
      ["Metric", "Value", "Unit", "Notes"],
      ["Shop", report.shopName, "", ""],
      ["From", report.from, "", "Inclusive shop date"],
      ["To", report.to, "", "Inclusive shop date"],
      ["Timezone", report.timezone, "", ""],
      [
        "Sales revenue",
        php(summary.total),
        "PHP",
        "After full refunds; cancelled sales excluded",
      ],
      [
        "Product costs",
        php(summary.productCosts),
        "PHP",
        summary.missingCosts
          ? "Known costs only; refunded prepared goods retain cost"
          : "Includes costs of refunded prepared goods",
      ],
      ["Gross profit", php(summary.grossProfit), "PHP", incomplete],
      [
        "Gross margin",
        summary.grossMargin,
        "%",
        summary.missingCosts
          ? incomplete
          : "Gross profit / revenue × 100; unavailable with zero revenue",
      ],
      [
        "Operating expenses",
        php(summary.operatingExpenses),
        "PHP",
        "Voided expenses excluded",
      ],
      [
        "Net profit",
        php(summary.netProfit),
        "PHP",
        summary.missingCosts
          ? incomplete
          : "Based on recorded costs and expenses only",
      ],
      [
        "Net margin",
        summary.netMargin,
        "%",
        summary.missingCosts
          ? incomplete
          : "Net profit / revenue × 100; unavailable with zero revenue",
      ],
      ["Completed sales", summary.orders, "sales", ""],
      ["Average sale", php(summary.average), "PHP", "Completed sales only"],
      ["Cash revenue", php(summary.cash), "PHP", "After full refunds"],
      ["E-wallet revenue", php(summary.wallet), "PHP", "After full refunds"],
      [
        "Refunded transactions",
        summary.refunds,
        "transactions",
        "Full refunds only; historical cancellations excluded",
      ],
      [
        "Sales missing cost",
        summary.missingCosts,
        "sales",
        "Completed or refunded; unknown costs are not assumed zero",
      ],
      [
        "Refund timing",
        "Original sale date",
        "",
        "Refunds restate the original sale period",
      ],
    ];
    if (summary.stockReturnCredits > 0) rows.push(["Stock return cost credits", php(summary.stockReturnCredits), "PHP", "Explicit finished-good returns dated in this reporting period; original receipt costs unchanged"]);
  } else if (kind === "sales") {
    const localDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: report.timezone,
    });
    rows = [
      [
        "Shop",
        "Report from",
        "Report to",
        "Shop timezone",
        "Receipt ID",
        "Sold at (UTC)",
        "Shop date",
        "Status",
        "Payment method",
        "Payment status",
        "Items",
        "Original total (PHP)",
        "Revenue (PHP)",
        "Product costs deducted (PHP)",
        "Gross profit (PHP)",
        "Cost status",
        "Refund reason",
        "Cost source",
      ],
      ...report.sales.map((sale) => {
        const totals = summarize([sale]);
        return [
          report.shopName,
          report.from,
          report.to,
          report.timezone,
          sale.id,
          sale.created_at,
          localDate.format(new Date(sale.created_at)),
          sale.status,
          paymentMethodLabel(sale.method),
          sale.payment_status,
          sale.items
            .map(
              (item) =>
                `${item.quantity} × ${item.name}${item.size_label ? ` (${item.size_label})` : ""}`,
            )
            .join("; "),
          php(sale.total_cents),
          php(totals.total),
          php(totals.missingCosts ? null : totals.productCosts),
          php(totals.grossProfit),
          sale.status === "cancelled"
            ? "Excluded"
            : totals.missingCosts
              ? "Incomplete: cost missing"
              : "Recorded",
          sale.refund_reason ?? "",
          sale.cost_note ?? "",
        ];
      }),
    ];
  } else {
    rows = [
      [
        "Shop",
        "Report from",
        "Report to",
        "Shop timezone",
        "Expense ID",
        "Expense date",
        "Description",
        "Status",
        "Original amount (PHP)",
        "Expense deducted (PHP)",
        ...(report.expenses.some(expense => expense.classification === "inventory_purchase") ? ["Accounting classification"] : []),
      ],
      ...report.expenses.map((expense) => [
        report.shopName,
        report.from,
        report.to,
        report.timezone,
        expense.id,
        expense.spent_on,
        expense.description,
        expense.voided ? "Voided" : "Active",
        php(expense.amount_cents),
        php(expense.voided || expense.classification === "inventory_purchase" ? 0 : expense.amount_cents),
        ...(report.expenses.some(row => row.classification === "inventory_purchase") ? [expense.classification === "inventory_purchase" ? "Inventory purchase — excluded" : "Operating expense"] : []),
      ]),
    ];
  }
  // BOM preserves Unicode shop/product names in Excel; CRLF and quoting preserve notes.
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
