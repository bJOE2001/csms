"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/ui/icon";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./primitives/dialog";
import { isNotificationTarget } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { DialogFooter } from "./dialog-layout";

export type DialogSize = "sm" | "md" | "lg";
export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: DialogSize;
  role?: "dialog" | "alertdialog";
  initialFocus?: "field" | "cancel";
  dismissible?: boolean;
  dismissOnOutside?: boolean;
  showCloseButton?: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

/** Preserve the application API while Radix owns the modal, focus trap and portal. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = "",
  size = "md",
  role = "dialog",
  initialFocus = "field",
  dismissible = true,
  dismissOnOutside = true,
  showCloseButton = true,
  returnFocusRef,
}: DialogProps) {
  const trigger = useRef<HTMLElement | null>(null);
  return (
    <ShadcnDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && dismissible) onClose();
      }}
    >
      <DialogContent
        role={role}
        data-size={size}
        aria-busy={!dismissible || undefined}
        showCloseButton={false}
        {...(!description ? { "aria-describedby": undefined } : {})}
        className={cn(
          "app-dialog flex max-w-none overflow-hidden rounded-[var(--radius-dialog)]",
          className,
        )}
        onOpenAutoFocus={(event) => {
          trigger.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          const content = event.currentTarget as HTMLElement;
          const initial =
            content.querySelector<HTMLElement>(initialFocus === "cancel" ? "[data-dialog-cancel]" : "[data-dialog-autofocus]") ??
            Array.from(
              content.querySelectorAll<HTMLElement>(
                'form input:not([type="hidden"]),form [role="combobox"],form select,form textarea,[data-dialog-cancel]',
              ),
            ).find(
              (control) =>
                !control.matches(":disabled") &&
                control.getClientRects().length > 0,
            );
          if (initial) {
            event.preventDefault();
            initial.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = returnFocusRef?.current ?? trigger.current;
          if (target?.isConnected) target.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (dismissible) onClose();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          if (dismissible && dismissOnOutside && !isNotificationTarget(event.target)) onClose();
        }}
      >
        <div className="dialog-heading" data-has-close={showCloseButton || undefined}>
          <div>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </div>
          {showCloseButton && <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            disabled={!dismissible}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>}
        </div>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </ShadcnDialog>
  );
}
