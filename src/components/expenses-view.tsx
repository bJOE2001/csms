"use client";
import { money, type Expense } from "@/lib/sales/domain";
import { summarizeExpenses } from "@/lib/expenses/domain";
import { ExpenseDialog, DeleteExpense } from "./expense-dialog";
import { DateRangeFilter } from "./date-range-filter";
import { Card } from "./ui/card";
import { DataTable } from "./ui/data-table";

export function ExpensesView({ expenses, shopId, founder, today, from, to }: {
  expenses: Expense[];
  shopId: string;
  founder: boolean;
  today: string;
  from: string;
  to: string;
}) {
  const summary = summarizeExpenses(expenses);
  return (
    <div className="menu-management expenses-management grid gap-6">
      <header className="sales-header">
        <div className="sales-heading">
          <h1 className="m-0">Expenses Management</h1>
          <p className="hint mb-0 mt-2">Track and manage your business operating expenses.</p>
        </div>
        <div className="sales-header-actions expenses-date-range">
          <DateRangeFilter
            from={from}
            to={to}
            action="/expenses"
            label="Filter expenses by date"
          />
          {founder && <ExpenseDialog shopId={shopId} today={today} />}
        </div>
      </header>
      {!founder && <p className="hint m-0">You can view expenses. An owner manages expense records.</p>}
      <dl className="menu-overview expenses-overview" aria-label="Expenses overview">
        {[
          ["Total Expenses", money(summary.total)],
          ["Expense Records", summary.records],
          ["Largest Expense", money(summary.largest)],
          ["Average Expense", money(summary.average)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <Card className="menu-products expenses-list">
        <DataTable
          caption="Expense records"
          toolbarLeading={<div className="menu-products-heading"><h2>Expenses</h2><p className="hint">View and manage recorded operating expenses.</p></div>}
          searchPlaceholder="Search expenses"
          emptyMessage="No expenses recorded for the selected period."
          columns={[
            { key: "date", label: "Date", kind: "compact" },
            { key: "description", label: "Description", kind: "primary" },
            { key: "amount", label: "Amount", numeric: true },
            { key: "status", label: "Status", kind: "status" },
            ...(founder ? [{ key: "actions", label: "Actions", kind: "actions" as const }] : []),
          ]}
          rows={expenses.map(expense => ({
            id: expense.id,
            search: `${expense.description} ${expense.spent_on} ${expense.voided ? "voided" : "active"}`,
            cells: {
              date: new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${expense.spent_on}T00:00:00Z`)),
              description: <strong>{expense.description}</strong>,
              amount: <span className={expense.voided ? "line-through text-muted-foreground" : "font-semibold"}>{money(expense.amount_cents)}</span>,
              status: <span className={`menu-status ${expense.voided ? "" : "menu-status-available"}`}>{expense.voided ? "Voided" : "Active"}</span>,
              actions: !expense.voided && <div className="table-actions">
                <ExpenseDialog expense={expense} shopId={shopId} today={today} />
                <DeleteExpense expense={expense} shopId={shopId} />
              </div>,
            },
          }))}
        />
      </Card>
    </div>
  );
}
