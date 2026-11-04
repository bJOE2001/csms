import { describe, expect, it } from "vitest";
import { calendarDate, calendarValue, displayCalendarDate, parseCalendarInput } from "./calendar-date";

describe("calendar date-only values", () => {
  it("rejects invalid dates instead of accepting JavaScript rollover", () => {
    for (const value of ["", "2026-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "2026-11-00", "0000-01-01", "11/04/2026", "not-a-date"])
      expect(calendarDate(value)).toBeUndefined();
    expect(calendarValue(calendarDate("2024-02-29")!)).toBe("2024-02-29");
  });
  it("round trips historical dates, leap days and DST boundaries without UTC slicing", () => {
    for (const value of ["0001-01-01", "0095-06-12", "1900-01-01", "2024-02-29", "2026-03-08", "2026-11-01", "2026-11-04", "9999-12-31"]) {
      expect(calendarValue(calendarDate(value)!)).toBe(value);
      expect(parseCalendarInput(displayCalendarDate(value))).toBe(value);
    }
  });
  it("uses the Manila calendar date at midnight and year boundaries", () => {
    expect(calendarValue(new Date("2026-11-03T15:59:59Z"))).toBe("2026-11-03");
    expect(calendarValue(new Date("2026-11-03T16:00:00Z"))).toBe("2026-11-04");
    expect(calendarValue(new Date("2025-12-31T16:00:00Z"))).toBe("2026-01-01");
  });
  it("accepts only unambiguous written or ISO input and preserves display meaning", () => {
    expect(displayCalendarDate("2026-11-04")).toBe("Nov 4, 2026");
    for (const text of ["Nov 4, 2026", "nov 04 2026", " 2026-11-04 "])
      expect(parseCalendarInput(text)).toBe("2026-11-04");
    for (const text of ["Nov 31, 2026", "Foo 4, 2026", "04/11/2026", "2026-2-1", "2026-11-04'\\]"])
      expect(parseCalendarInput(text)).toBeUndefined();
  });
});
