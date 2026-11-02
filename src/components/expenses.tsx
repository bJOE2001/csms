"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { cents, money, type Expense } from "@/lib/sales/domain";
import { Card, CardHeader } from "./ui/card";
import { FormDialog } from "./ui/form-dialog";
import { MutationForm } from "./mutation-form";
import { Input } from "./ui/primitives/input";

export function Expenses({
  expenses,
  shopId,
  founder,
  today,
}: {
  expenses: Expense[];
  shopId: string;
  founder: boolean;
  today: string;
}) {
  const router = useRouter();
  const draftId = useRef<string | undefined>(undefined);
  async function save(action: string, data: unknown) {
    try {
      const response = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shop_id: shopId, data }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      router.refresh();
      return { status: "success" as const, message: "Expense saved." };
    } catch (error) {
      return {
        status: "error" as const,
        message:
          error instanceof Error
            ? error.message
            : "Expense could not be saved. Retry the same entry.",
      };
    }
  }
  return (
    <Card>
      <CardHeader
        title="Operating expenses"
        description="Rent, wages, utilities, payment fees and other overhead. Product costs are already deducted; do not enter them again here."
        actions={
          founder && (
            <FormDialog trigger="Add expense" title="Add expense">
              <MutationForm
                submitLabel="Save expense"
                action={async (_previous, form) => {
                  try {
                    const result = await save("expense", {
                      id: (draftId.current ??= crypto.randomUUID()),
                      spent_on: String(form.get("spent_on")),
                      description: String(form.get("description")),
                      amount_cents: cents(String(form.get("amount"))),
                    });
                    if (result.status === "success")
                      draftId.current = undefined;
                    return result;
                  } catch (error) {
                    return {
                      status: "error",
                      message:
                        error instanceof Error
                          ? error.message
                          : "Check the expense amount.",
                    };
                  }
                }}
              >
                <label className="field">
                  Expense date
                  <Input
                    name="spent_on"
                    type="date"
                    defaultValue={today}
                    required
                  />
                </label>
                <label className="field">
                  Description
                  <Input
                    name="description"
                    required
                    maxLength={200}
                    placeholder="For example, electricity"
                  />
                </label>
                <label className="field">
                  Amount (PHP)
                  <Input name="amount" inputMode="decimal" required />
                </label>
                <p className="hint">
                  Use the date the expense belongs to. It appears when that date
                  is included in the report.
                </p>
              </MutationForm>
            </FormDialog>
          )
        }
      />
      {!expenses.length ? (
        <p className="hint">No expenses recorded for these dates.</p>
      ) : (
        <ul className="divide-y">
          {expenses.map((expense) => (
            <li
              key={expense.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 break-words">
                <strong>{expense.description}</strong>
                <p className="hint">
                  {expense.spent_on}
                  {expense.voided && " · Voided"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    expense.voided
                      ? "line-through text-muted-foreground"
                      : "font-semibold"
                  }
                >
                  {money(expense.amount_cents)}
                </span>
                {founder && !expense.voided && (
                  <FormDialog
                    trigger="Void"
                    triggerLabel={`Void expense ${expense.description}`}
                    title="Void this expense?"
                    description="The entry stays in history and stops reducing profit."
                    confirmation
                    danger
                  >
                    <MutationForm
                      submitLabel="Confirm void"
                      action={() => save("void_expense", { id: expense.id })}
                    >
                      {null}
                    </MutationForm>
                  </FormDialog>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
