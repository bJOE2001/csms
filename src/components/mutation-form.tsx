"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import { Icon } from "@/components/ui/icon";
import { useFormDialog } from "@/components/ui/form-dialog";

export function MutationForm({
  action,
  children,
  submitLabel,
  disabled = false,
  successTitle,
  errorTitle = "Operation failed",
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  disabled?: boolean;
  successTitle?: string;
  errorTitle?: string;
}) {
  const dialog = useFormDialog();
  const noticeId = useId();
  const submitter = useRef<HTMLElement | null>(null);
  const preserveValues = useRef(false);
  const [state, formAction, pending] = useActionState(
    async (previous: ActionState, form: FormData) => {
      preserveValues.current = false;
      let result: ActionState;
      try {
        result = await action(previous, form);
      } catch {
        result = { status: "error", message: "The operation could not be completed. Check your connection and try again." };
      }
      preserveValues.current = result.status === "error";
      if (result.status === "success") {
        notify.success(successTitle ?? result.message, {
          id: noticeId, description: successTitle ? result.message : undefined,
        });
        dialog?.complete();
      } else if (result.status === "error" && !result.validation) {
        notify.error(errorTitle, { id: noticeId, description: result.message });
      } else if (result.validation) notify.dismiss(noticeId);
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
    if (state.validation) message.current?.focus();
    else if (state.status === "error" && document.activeElement === document.body) {
      // Disabling the pending fieldset can blur its submit button. Restore the
      // initiating control for retry, without moving focus into a notification.
      submitter.current?.focus({ preventScroll: true });
    }
  }, [state]);
  return (
    <form
      action={formAction}
      className="management-form"
      onSubmit={(event) => {
        submitter.current = (event.nativeEvent as SubmitEvent).submitter;
      }}
      onReset={(event) => {
        if (preserveValues.current) event.preventDefault();
      }}
    >
      <div className={dialog ? "dialog-body" : "form-body"}>
        {state.message && state.validation && (
          <p ref={message} tabIndex={-1} className="form-message error" role="alert">
            <Icon name="alert" size={18} /><span>{state.message}</span>
          </p>
        )}
        <fieldset className="mutation-fields" disabled={pending || disabled}>
          {children}
        </fieldset>
      </div>
      <div className={dialog ? "dialog-footer" : "form-actions"}>
        {dialog && (
          <Button
            className="secondary"
            disabled={pending}
            data-dialog-cancel
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
    </form>
  );
}
