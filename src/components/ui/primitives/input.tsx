// Adapted from shadcn/ui New York (Tailwind 3), MIT.
import * as React from "react";

import { cn } from "@/lib/utils";

type InputProps = React.ComponentProps<"input"> & {
  /** A surrounding .input-group owns the focus indicator for embedded fields. */
  focusOwner?: "self" | "parent";
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, focusOwner = "self", ...props }, ref) => {
    return (
      <input
        type={type}
        data-focus-owner={focusOwner === "parent" ? "parent" : undefined}
        className={cn(
          "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2.5 text-base transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
