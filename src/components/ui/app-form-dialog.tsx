"use client";

import { Dialog, type DialogProps } from "./dialog";

export type AppFormDialogProps = Omit<DialogProps, "role" | "initialFocus" | "dismissOnOutside">;

/** Feature forms own validation and submission. MutationForm supplies their body/footer. */
export function AppFormDialog({ showCloseButton = false, ...props }: AppFormDialogProps) {
  return <Dialog {...props} showCloseButton={showCloseButton} role="dialog" initialFocus="field" />;
}
