"use client";

import { forwardRef } from "react";
import { useFormStatus } from "react-dom";
import {
  Button as ShadcnButton,
  type ButtonProps as ShadcnButtonProps,
} from "./primitives/button";
import { cn } from "@/lib/utils";

type ButtonProps = ShadcnButtonProps & {
  pending?: boolean;
  pendingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      children,
      pending = false,
      pendingLabel = "Saving…",
      disabled,
      className = "",
      type = "button",
      variant,
      size,
      asChild = false,
      ...props
    },
    ref,
  ) {
    const legacy = className.split(/\s+/);
    const resolvedVariant =
      variant ??
      (legacy.includes("danger")
        ? "destructive"
        : legacy.includes("secondary")
          ? "outline"
          : "default");
    const resolvedSize =
      size ?? (legacy.includes("compact") ? "sm" : "default");
    return (
      <ShadcnButton
        {...props}
        ref={ref}
        type={type}
        asChild={asChild}
        variant={resolvedVariant}
        size={resolvedSize}
        className={cn(
          "button",
          resolvedVariant === "outline" && "secondary",
          resolvedVariant === "destructive" && "danger",
          (resolvedVariant === "ghost" || resolvedVariant === "link") &&
            "border-transparent bg-transparent shadow-none",
          resolvedVariant === "secondary" && "border-transparent",
          className,
        )}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
      >
        {asChild ? (
          children
        ) : (
          <span className="button-labels" data-pending={pending}>
            <span className="button-idle">{children}</span>
            <span className="button-pending" aria-hidden={!pending}>
              <span className="spinner" aria-hidden="true" />
              {pendingLabel}
            </span>
          </span>
        )}
      </ShadcnButton>
    );
  },
);

export function SubmitButton(props: Omit<ButtonProps, "pending" | "type">) {
  const { pending } = useFormStatus();
  return <Button {...props} type="submit" pending={pending} />;
}
