"use client";

import type { ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { DayPicker, type DayPickerProps, type DropdownProps } from "@daypicker/react";
import { cn } from "@/lib/utils";
import { CALENDAR_TIME_ZONE } from "@/lib/calendar-date";
import { Select } from "./select";

// Reuse the application's accessible portaled Select instead of native option menus.
function CalendarDropdown({ options, value, onChange, disabled, className, "aria-label": label }: DropdownProps) {
  return (
    <Select
      className={cn("calendar-dropdown", className)}
      aria-label={label}
      value={String(value ?? "")}
      disabled={disabled}
      options={(options ?? []).map(option => ({ ...option, value: String(option.value) }))}
      onValueChange={next => onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)}
    />
  );
}

/** shadcn-style composition using DayPicker v10's current component/class keys. */
export function Calendar({ className, classNames, components, ...props }: DayPickerProps) {
  return (
    <DayPicker
      timeZone={CALENDAR_TIME_ZONE}
      showOutsideDays
      fixedWeeks
      captionLayout="dropdown"
      navLayout="around"
      className={cn("calendar", className)}
      classNames={{
        month: "calendar-month", month_caption: "calendar-caption", dropdowns: "calendar-dropdowns",
        months_dropdown: "calendar-month-dropdown", years_dropdown: "calendar-year-dropdown",
        button_previous: "calendar-nav calendar-previous", button_next: "calendar-nav calendar-next",
        month_grid: "calendar-grid", weekday: "calendar-weekday", day: "calendar-day",
        day_button: "calendar-day-button", selected: "calendar-selected", today: "calendar-today",
        outside: "calendar-outside", disabled: "calendar-disabled", hidden: "calendar-hidden",
        range_start: "calendar-range-start", range_end: "calendar-range-end", range_middle: "calendar-range-middle",
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : orientation === "right" ? ChevronRight : ChevronDown;
          return <Icon size={18} strokeWidth={1.6} aria-hidden="true" />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
