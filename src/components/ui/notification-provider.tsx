"use client";

import { useEffect, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { isNotificationTarget } from "@/lib/notify";

export function NotificationProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Keep a modal's current field focused when dismissing a toast with a pointer.
    const pointer = (event: PointerEvent) => {
      if (!isNotificationTarget(event.target)) return;
      const modal = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
      if (modal) event.preventDefault();
    };
    // Keyboard dismissal also works while a modal correctly traps focus inside its form.
    const keyboard = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyD") {
        const latest = toast.getToasts().at(-1);
        if (latest) {
          event.preventDefault();
          toast.dismiss(latest.id);
        }
      }
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard);
    };
  }, []);
  return <>
    <Toaster
      position="top-center" theme="light" className="app-toaster"
      visibleToasts={3} gap={10} closeButton
      offset={{ top: "max(16px, env(safe-area-inset-top))" }}
      mobileOffset={{ top: "max(12px, env(safe-area-inset-top))", left: "max(16px, env(safe-area-inset-left))", right: "max(16px, env(safe-area-inset-right))" }}
      customAriaLabel="Notifications. Alt+T to focus. Alt+Shift+D to dismiss the latest notification."
      icons={{ success: <CheckCircle2 aria-hidden="true" size={20} />,
        error: <CircleAlert aria-hidden="true" size={20} />,
        warning: <AlertTriangle aria-hidden="true" size={20} />,
        info: <Info aria-hidden="true" size={20} />, close: <X aria-hidden="true" size={16} /> }}
      toastOptions={{ unstyled: true, className: "app-toast", closeButtonAriaLabel: "Dismiss notification" }}
    />{children}</>;
}
