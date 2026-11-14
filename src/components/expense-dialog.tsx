"use client";
import { useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLoadingTransition } from "./ui/global-loading-bar";
import { cents, money, type Expense } from "@/lib/sales/domain";
import type { ActionState } from "@/lib/action-state";
import { FormDialog } from "./ui/form-dialog";
import { MutationForm } from "./mutation-form";
import { Input } from "./ui/primitives/input";
import { Icon } from "./ui/icon";
import { Pencil, Trash2 } from "lucide-react";
import { DatePicker } from "./ui/date-picker";
import { Select } from "./ui/select";

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
  const startRefresh = useLoadingTransition();
  const dateId = useId();
  const draftId = useRef<string | undefined>(undefined);
  const operationId = useRef<string | undefined>(undefined);
  return (
    <FormDialog
      trigger={expense ? null : <><Icon name="plus" size={18} />Add Expense</>}
      tableAction={expense ? { icon: Pencil, tooltip: "Edit expense" } : undefined}
      triggerLabel={expense ? `Edit expense ${expense.description}` : undefined}
      triggerClassName={expense ? "secondary compact" : "accent"}
      title={expense ? "Edit expense" : "Add expense"}
    >
      <MutationForm
        successTitle={expense ? "Expense updated" : "Expense created"}
        errorTitle="Failed to save expense"
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
              classification: String(form.get("classification")),
              ...(expense && {
                operation_id: (operationId.current ??= crypto.randomUUID()),
                expected: { spent_on: expense.spent_on, description: expense.description, amount_cents: expense.amount_cents, ...(expense.classification ? { classification: expense.classification } : {}) },
              }),
            };
            const result = await saveExpense(expense ? "update_expense" : "expense", shopId, data);
            if (result.status === "success") {
              draftId.current = undefined;
              operationId.current = undefined;
              startRefresh(() => router.refresh());
            }
            return result;
          } catch (error) {
            return { status: "error", validation: true, message: error instanceof Error ? error.message : "Check the expense details." };
          }
        }}
      >
        <div className="field">
          <label htmlFor={dateId}>Expense date</label>
          <DatePicker id={dateId} label="Expense date" name="spent_on" defaultValue={expense?.spent_on ?? today} required />
        </div>
        <label className="field">
          Description
          <Input name="description" defaultValue={expense?.description} maxLength={200} required />
        </label>
        <label className="field">
          Amount (PHP)
          <Input name="amount" inputMode="decimal" defaultValue={expense ? (expense.amount_cents / 100).toFixed(2) : undefined} required />
        </label>
        <label className="field">Accounting classification
          <Select name="classification" defaultValue={expense?.classification ?? "operating_expense"} options={[{ value: "operating_expense", label: "Operating expense — deducted from profit" }, { value: "inventory_purchase", label: "Inventory purchase — excluded from operating expenses" }]} />
        </label>
        <p className="hint">Do not re-enter product costs. Receive inventory through Stock In.</p>
      </MutationForm>
    </FormDialog>
  );
}

export function DeleteExpense({ expense, shopId }: { expense: Expense; shopId: string }) {
  const router = useRouter();
  const startRefresh = useLoadingTransition();
  return (
    <FormDialog
      trigger={null}
      tableAction={{ icon: Trash2, tooltip: "Delete expense", variant: "destructive" }}
      triggerLabel={`Delete expense ${expense.description}`}
      title="Delete this expense?"
      description={`${expense.description} · ${money(expense.amount_cents)}. This entry will be voided and excluded from profit calculations. Its history will be retained.`}
      confirmation
      danger
    >
      <MutationForm successTitle="Expense deleted" errorTitle="Failed to delete expense" submitLabel="Confirm delete" action={async () => {
        const result = await saveExpense("void_expense", shopId, { id: expense.id });
        if (result.status === "success") startRefresh(() => router.refresh());
        return result;
      }}>{null}</MutationForm>
    </FormDialog>
  );
}
