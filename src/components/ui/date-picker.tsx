"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { TZDate } from "@daypicker/react";
import { calendarDate, calendarValue, CALENDAR_TIME_ZONE, displayCalendarDate, parseCalendarInput } from "@/lib/calendar-date";
import { Input } from "./primitives/input";
import { Calendar } from "./calendar";
import { Popover, PopoverAnchor, PopoverClose, PopoverContent, PopoverTrigger } from "./popover";
import { useFormDialog } from "./form-dialog";

type Props = {
  label: string;
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, source: "calendar" | "input") => void;
  min?: string;
  disabled?: boolean;
  required?: boolean;
  range?: { from: string; to: string };
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

export function DatePicker({ label, id, name, value, defaultValue = "", onValueChange, min, disabled, required, range, "aria-invalid": invalid, "aria-describedby": description }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const [localValue, setLocalValue] = useState(defaultValue);
  const selectedValue = value ?? localValue;
  const [text, setText] = useState(() => displayCalendarDate(selectedValue));
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const interactedOutside = useRef(false);
  const dialog = useFormDialog();
  const selectedDate = calendarDate(selectedValue);
  const minimum = min ? calendarDate(min) : undefined;
  const invalidText = !!text && !parseCalendarInput(text);
  const beforeMinimum = !!selectedDate && !!minimum && selectedDate < minimum;
  const message = invalidText ? "Enter a valid date, such as Nov 4, 2026 or YYYY-MM-DD." : beforeMinimum ? `Choose ${displayCalendarDate(min!)} or a later date.` : "Use a date such as Nov 4, 2026 or YYYY-MM-DD, or open the calendar. Alt+Down Arrow opens the calendar.";

  useEffect(() => {
    if (!editing) setText(displayCalendarDate(selectedValue));
  }, [selectedValue, editing]);
  useEffect(() => {
    input.current?.setCustomValidity(invalidText || beforeMinimum ? message : "");
  }, [invalidText, beforeMinimum, message]);
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const reset = (event: Event) => queueMicrotask(() => {
      // Failed React actions cancel reset; preserve the same expense draft.
      if (!event.defaultPrevented && value === undefined) {
        setLocalValue(defaultValue);
        setText(displayCalendarDate(defaultValue));
        setEditing(false);
        setOpen(false);
      }
    });
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultValue, value]);

  const update = (next: string, source: "calendar" | "input") => {
    if (disabled || input.current?.matches(":disabled")) return;
    if (value === undefined) setLocalValue(next);
    onValueChange?.(next, source);
    if (next !== selectedValue) dialog?.markDirty();
  };
  const changeOpen = (next: boolean) => {
    if (next) {
      opener.current = document.activeElement as HTMLElement | null;
      interactedOutside.current = false;
    }
    setOpen(next);
  };
  const chooseDay = (day: Date) => {
    if (disabled || input.current?.matches(":disabled")) return;
    update(calendarValue(day), "calendar");
    setText(displayCalendarDate(calendarValue(day)));
    setEditing(false);
    setOpen(false);
  };
  const rangeStart = range && calendarDate(range.from);
  const rangeEnd = range && calendarDate(range.to);
  const selectedRange = rangeStart && rangeEnd && rangeStart <= rangeEnd ? { from: rangeStart, to: rangeEnd } : undefined;
  const today = TZDate.tz(CALENDAR_TIME_ZONE);
  const years = [today.getFullYear(), selectedDate?.getFullYear(), rangeStart?.getFullYear(), rangeEnd?.getFullYear()].filter((year): year is number => year !== undefined);
  const startMonth = calendarDate(`${String(Math.min(1900, ...years)).padStart(4, "0")}-01-01`);
  const endMonth = calendarDate(`${String(Math.min(9999, Math.max(today.getFullYear() + 10, ...years))).padStart(4, "0")}-12-31`);
  const calendarProps = {
    defaultMonth: minimum && (!selectedDate || selectedDate < minimum) ? minimum : selectedDate ?? rangeStart ?? today,
    startMonth, endMonth,
    disabled: minimum ? { before: minimum } : undefined,
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverAnchor asChild>
        <div className="date-picker-field input-group">
          {name && <input type="hidden" name={name} value={selectedDate ? selectedValue : ""} disabled={disabled} />}
          <Input
            ref={input}
            id={inputId}
            type="text"
            focusOwner="parent"
            value={text}
            aria-label={label}
            aria-invalid={invalid || invalidText || beforeMinimum || undefined}
            aria-describedby={[description, hintId].filter(Boolean).join(" ")}
            autoComplete="off"
            spellCheck={false}
            placeholder="MMM D, YYYY"
            disabled={disabled}
            required={required}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            onChange={event => {
              const next = event.currentTarget.value;
              setText(next);
              update(parseCalendarInput(next) ?? next, "input");
            }}
            onKeyDown={event => {
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                changeOpen(true);
              }
            }}
          />
          <PopoverTrigger asChild>
            <button className="date-picker-trigger" type="button" aria-label={`Open ${label} calendar`} disabled={disabled}>
              <CalendarDays size={18} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <span className="sr-only" id={hintId}>{message}</span>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={popup}
        className="date-picker-popover"
        aria-label={`${label} calendar`}
        onOpenAutoFocus={event => {
          event.preventDefault();
          const active = selectedDate ? popup.current?.querySelector<HTMLButtonElement>(`[data-day="${calendarValue(selectedDate)}"] button:not(:disabled)`) : null;
          (active ?? popup.current?.querySelector<HTMLButtonElement>('.calendar-day-button[tabindex="0"]:not(:disabled)') ?? popup.current?.querySelector<HTMLButtonElement>('.calendar-day-button:not(:disabled)'))?.focus();
        }}
        onInteractOutside={() => { interactedOutside.current = true; }}
        onCloseAutoFocus={event => {
          if (!interactedOutside.current && opener.current?.isConnected) {
            event.preventDefault();
            opener.current.focus({ preventScroll: true });
          }
        }}
      >
        <div className="calendar-heading">
          <p>{label}</p>
          <PopoverClose asChild>
            <button type="button" className="calendar-close" aria-label="Close calendar"><X size={18} aria-hidden="true" /></button>
          </PopoverClose>
        </div>
        {range ? (
          <Calendar {...calendarProps} mode="range" selected={selectedRange} onSelect={(_range, day) => chooseDay(day)} required />
        ) : (
          <Calendar {...calendarProps} mode="single" selected={selectedDate} onSelect={day => chooseDay(day)} required />
        )}
        {range && <p className="calendar-range-summary">{displayCalendarDate(range.from) || "Start date"} – {displayCalendarDate(range.to) || "End date"}</p>}
      </PopoverContent>
    </Popover>
  );
}
