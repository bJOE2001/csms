"use client";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { cents, money, type Expense } from "@/lib/sales/domain";
import type { ActionState } from "@/lib/action-state";
import { FormDialog } from "./ui/form-dialog";
import { MutationForm } from "./mutation-form";
import { Input } from "./ui/primitives/input";
import { Icon } from "./ui/icon";

async function saveExpense(
  action: "expense" | "update_expense" | "void_expense",
  shopId: string,
  data: unknown,
): Promise<ActionState> {
  try {
    const response = await fetch("/api/pos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, shop_id: shopId, data }),
    });
    const result = await response.json();
    if (!response.ok) return {
      status: "error", message: result.error ?? "Expense could not be saved. Retry the same entry.",
    };
    return {
      status: "success",
      message: action === "void_expense"
        ? "Expense deleted from totals. Its record remains in history."
        : action === "update_expense" ? "Expense updated." : "Expense saved.",
    };
  } catch {
    return { status: "error", message: "Expense could not be saved. Check your connection and retry the same entry." };
  }
}

export function ExpenseDialog({ expense, shopId, today }: {
  expense?: Expense;
  shopId: string;
  today: string;
}) {
  const router = useRouter();
  const draftId = useRef<string | undefined>(undefined);
  const operationId = useRef<string | undefined>(undefined);
  return (
    <FormDialog
      trigger={<>{expense ? "Edit" : "Add Expense"}</>}
      triggerLabel={expense ? `Edit expense ${expense.description}` : undefined}
      triggerClassName={expense ? "secondary compact" : ""}
      title={expense ? "Edit expense" : "Add expense"}
      description="Record overhead such as rent, wages and utilities. Product costs are already deducted in Sales; do not enter them again here."
    >
      <MutationForm
        submitLabel={expense ? "Save changes" : "Save expense"}
        action={async (_previous, form) => {
          try {
            const amount = cents(String(form.get("amount")));
            const description = String(form.get("description")).trim();
            if (amount < 1 || amount > 100000000)
              throw Error("Enter an amount from ₱0.01 to ₱1,000,000.00.");
            if (!description) throw Error("Enter an expense description.");
            const data = {
              id: expense?.id ?? (draftId.current ??= crypto.randomUUID()),
              spent_on: String(form.get("spent_on")),
              description,
              amount_cents: amount,
              ...(expense && {
                operation_id: (operationId.current ??= crypto.randomUUID()),
                expected: { spent_on: expense.spent_on, description: expense.description, amount_cents: expense.amount_cents },
              }),
            };
            const result = await saveExpense(expense ? "update_expense" : "expense", shopId, data);
            if (result.status === "success") {
              draftId.current = undefined;
              operationId.current = undefined;
              router.refresh();
            }
            return result;
          } catch (error) {
            return { status: "error", message: error instanceof Error ? error.message : "Check the expense details." };
          }
        }}
      >
        <label className="field">
          Expense date
          <Input name="spent_on" type="date" defaultValue={expense?.spent_on ?? today} required />
        </label>
        <label className="field">
          Description
          <Input name="description" defaultValue={expense?.description} maxLength={200} required placeholder="For example, electricity" />
        </label>
        <label className="field">
          Amount (PHP)
          <Input name="amount" inputMode="decimal" defaultValue={expense ? (expense.amount_cents / 100).toFixed(2) : undefined} required />
        </label>
        <p className="hint">Use the date the expense belongs to. It appears in both reports when that date is included.</p>
      </MutationForm>
    </FormDialog>
  );
}

export function DeleteExpense({ expense, shopId }: { expense: Expense; shopId: string }) {
  const router = useRouter();
  return (
    <FormDialog
      trigger={<><Icon name="delete" size={16} />Delete</>}
      triggerLabel={`Delete expense ${expense.description}`}
      title="Delete this expense?"
      description={`${expense.description} · ${money(expense.amount_cents)}. This entry will be voided and excluded from profit calculations. Its history will be retained.`}
      confirmation
      danger
    >
      <MutationForm submitLabel="Confirm delete" action={async () => {
        const result = await saveExpense("void_expense", shopId, { id: expense.id });
        if (result.status === "success") router.refresh();
        return result;
      }}>{null}</MutationForm>
    </FormDialog>
  );
}
