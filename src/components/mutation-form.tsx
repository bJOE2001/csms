"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useFormDialog } from "@/components/ui/form-dialog";

export function MutationForm({
  action,
  children,
  submitLabel,
  disabled = false,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
}) {
  const dialog = useFormDialog();
  const preserveValues = useRef(false);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      preserveValues.current = false;
      const result = await action(previous, form);
      preserveValues.current = result.status === "error";
      if (result.status === "success") dialog?.complete(result.message);
      return result;
    },
    initialActionState,
  );
  const handled = useRef<ActionState | null>(null),
    message = useRef<HTMLParagraphElement>(null);
  const setPending = dialog?.setPending;
  useEffect(() => {
    setPending?.(pending);
    return () => setPending?.(false);
  }, [pending, setPending]);
  useEffect(() => {
    if (!state.message || handled.current === state) return;
    handled.current = state;
    if (state.status === "error") message.current?.focus();
  }, [state]);
  return (
    <form
      action={formAction}
      className="management-form"
      onReset={(event) => {
        if (preserveValues.current) event.preventDefault();
      }}
    >
      <fieldset disabled={pending || disabled}>
        {children}
        <div className="form-actions">
          {dialog && (
            <Button
              className="secondary"
              disabled={pending}
              onClick={dialog.cancel}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            className={dialog?.danger ? "danger" : ""}
            pending={pending}
            disabled={disabled}
          >
            {submitLabel}
          </Button>
        </div>
      </fieldset>
      {state.message && !(dialog && state.status === "success") && (
        <p
          ref={message}
          tabIndex={-1}
          className={`form-message ${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          <Icon name={state.status === "error" ? "alert" : "check"} size={18} />
          <span>{state.message}</span>
        </p>
      )}
    </form>
  );
}
