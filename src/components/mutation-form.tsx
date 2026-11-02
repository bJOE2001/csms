"use client";

import { useActionState, type ReactNode } from "react";
import { initialActionState, type ActionState } from "@/lib/menu/action-state";

export function MutationForm({ action, children, submitLabel, disabled = false }: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  return <form action={formAction} className="management-form">
    <fieldset disabled={pending || disabled}>
      {children}
      <button type="submit" className="button" disabled={pending || disabled}>{pending ? "Saving…" : submitLabel}</button>
    </fieldset>
    {state.message && <p className={`form-message ${state.status}`} role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
  </form>;
}
