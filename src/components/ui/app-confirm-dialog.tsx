"use client";

import { Dialog, type DialogProps } from "./dialog";

type AppConfirmDialogProps = Omit<DialogProps, "role" | "initialFocus" | "dismissOnOutside" | "showCloseButton">;

/** Reuse the installed Radix modal/focus infrastructure with alert-dialog semantics.
 * Confirmations focus the safe action and require an explicit close or cancel.
 * Feature-specific MutationForm children keep the original confirmation action.
 */
export function AppConfirmDialog({ size = "sm", ...props }: AppConfirmDialogProps) {
  return <Dialog {...props} size={size} role="alertdialog" initialFocus="cancel" dismissOnOutside={false} showCloseButton={false} />;
}
