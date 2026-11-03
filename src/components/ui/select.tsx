"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectProps = Pick<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
  "id" | "aria-label" | "aria-labelledby" | "aria-describedby" | "aria-invalid" | "onBlur" | "className"
> & {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: "default" | "compact";
};

/** Radix owns interaction; named form fields retain their original string values,
 * including the empty category value that Radix items cannot use directly. */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select({
  options, value, defaultValue, onValueChange, name, disabled,
  placeholder = "Select an option", size = "default", className, ...triggerProps
}, forwardedRef) {
  const initialValue = defaultValue ?? options[0]?.value ?? "";
  const [localValue, setLocalValue] = React.useState(initialValue);
  const selectedValue = value ?? localValue;
  const trigger = React.useRef<HTMLButtonElement>(null);
  const resetEvent = React.useRef<Event | null>(null);
  React.useImperativeHandle(forwardedRef, () => trigger.current!);

  React.useEffect(() => {
    const form = trigger.current?.closest("form");
    if (!form) return;
    // React action failures cancel reset to preserve drafts. Radix's reset
    // listener runs even for cancelled events, so defer to the final result.
    const reset = (event: Event) => {
      resetEvent.current = event;
      queueMicrotask(() => {
        if (!event.defaultPrevented && value === undefined) setLocalValue(initialValue);
        resetEvent.current = null;
      });
    };
    form.addEventListener("reset", reset, true);
    return () => form.removeEventListener("reset", reset, true);
  }, [initialValue, value]);

  const selected = options.find(option => option.value === selectedValue);
  return (
    <>
      {name && <input type="hidden" name={name} value={selectedValue} disabled={disabled} />}
      <SelectPrimitive.Root
        value={selected ? `value:${selectedValue}` : ""}
        disabled={disabled}
        onValueChange={next => {
          if (resetEvent.current) return;
          const nextValue = next.slice("value:".length);
          if (value === undefined) setLocalValue(nextValue);
          onValueChange?.(nextValue);
        }}
      >
        <SelectPrimitive.Trigger
          ref={trigger}
          className={cn("select-trigger", size === "compact" && "select-trigger-compact", className)}
          {...triggerProps}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="select-chevron" size={16} strokeWidth={1.6} aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content className="select-content" position="popper" align="start" sideOffset={6} collisionPadding={12}>
            <SelectPrimitive.ScrollUpButton className="select-scroll-button">
              <ChevronUp size={16} aria-hidden="true" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="select-viewport">
              {options.map(option => (
                <SelectPrimitive.Item className="select-option" key={option.value} value={`value:${option.value}`} disabled={option.disabled} textValue={option.label}>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="select-indicator">
                    <Check size={16} strokeWidth={1.8} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="select-scroll-button">
              <ChevronDown size={16} aria-hidden="true" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </>
  );
});
