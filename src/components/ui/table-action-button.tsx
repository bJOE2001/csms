"use client";

import { forwardRef, type ComponentPropsWithoutRef } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type Props = Omit<ComponentPropsWithoutRef<typeof Button>, "children" | "size" | "variant" | "aria-label"> & {
  icon: LucideIcon;
  label: string;
  tooltip?: string;
  variant?: "standard" | "destructive";
};

export const TableActionButton = forwardRef<HTMLButtonElement, Props>(
  function TableActionButton({ icon: Icon, label, tooltip = label, variant = "standard", className, disabled, ...props }, ref) {
    const button = (
      <Button
        {...props}
        ref={ref}
        size="icon"
        variant="outline"
        className={cn("table-action-button", variant === "destructive" && "table-action-destructive", className)}
        aria-label={label}
        disabled={disabled}
      >
        <Icon size={18} strokeWidth={1.6} aria-hidden="true" focusable="false" />
      </Button>
    );
    return (
      <Tooltip.Provider delayDuration={350}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            {disabled ? (
              <span className="table-action-disabled" tabIndex={0} aria-label={`${label} (unavailable)`}>
                {button}
              </span>
            ) : button}
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content className="table-action-tooltip" side="top" sideOffset={6} collisionPadding={8}>
              {tooltip}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  },
);
