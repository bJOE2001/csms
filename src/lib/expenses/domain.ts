import { z } from "zod";
import { expenseSchema, type Expense } from "@/lib/sales/domain";

export const updateExpenseSchema = expenseSchema.extend({
  operation_id: z.uuid(),
  expected: expenseSchema.omit({ id: true }),
});

export function summarizeExpenses(expenses: Expense[]) {
  const active = expenses.filter((expense) => !expense.voided);
  const total = active.reduce((sum, expense) => sum + expense.amount_cents, 0);
  return {
    total,
    records: expenses.length,
    voided: expenses.length - active.length,
    largest: active.reduce((largest, expense) => Math.max(largest, expense.amount_cents), 0),
    average: active.length ? Math.round(total / active.length) : 0,
  };
}
