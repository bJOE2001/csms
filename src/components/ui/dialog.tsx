"use client";

import { useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import {
  Dialog as ShadcnDialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./primitives/dialog";
import { cn } from "@/lib/utils";

/** Preserve the application API while Radix owns the modal, focus trap and portal. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className = "",
  role = "dialog",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  role?: "dialog" | "alertdialog";
  dismissible?: boolean;
}) {
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
        showCloseButton={false}
        {...(!description ? { "aria-describedby": undefined } : {})}
        className={cn(
          "app-dialog max-w-none rounded-[var(--radius-dialog)]",
          className,
        )}
        onOpenAutoFocus={(event) => {
          trigger.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          const content = event.currentTarget as HTMLElement;
          const initial =
            content.querySelector<HTMLElement>("[data-dialog-autofocus]") ??
            Array.from(
              content.querySelectorAll<HTMLElement>(
                'form input:not([type="hidden"]),form select,form textarea,.form-actions .button.secondary',
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
          if (trigger.current?.isConnected)
            trigger.current.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          if (dismissible) onClose();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          if (dismissible) onClose();
        }}
      >
        <div className="dialog-heading">
          <div>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close dialog"
            disabled={!dismissible}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </DialogContent>
    </ShadcnDialog>
  );
}
