import { TZDate } from "@daypicker/react";

export const CALENDAR_TIME_ZONE = "Asia/Manila";
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Calendar values remain date-only strings. Never serialize a local Date as UTC. */
export function calendarDate(value: string): TZDate | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return undefined;
  const date = new TZDate(2000, 0, 1, 12, 0, 0, CALENDAR_TIME_ZONE);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function calendarValue(date: Date): string {
  const day = TZDate.tz(CALENDAR_TIME_ZONE, date);
  return `${String(day.getFullYear()).padStart(4, "0")}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

export function displayCalendarDate(value: string): string {
  const date = calendarDate(value);
  return date ? `${months[date.getMonth()]} ${date.getDate()}, ${String(date.getFullYear()).padStart(4, "0")}` : value;
}

/** Accept an unambiguous written date or the existing ISO form representation. */
export function parseCalendarInput(text: string): string | undefined {
  const value = text.trim();
  if (calendarDate(value)) return value;
  const match = /^([a-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/i.exec(value);
  if (!match) return undefined;
  const month = months.findIndex(name => name.toLowerCase() === match[1].toLowerCase());
  if (month < 0) return undefined;
  const iso = `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return calendarDate(iso) ? iso : undefined;
}
