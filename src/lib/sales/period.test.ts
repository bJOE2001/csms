import { describe, expect, it } from "vitest";
import {
  dateRangeError, periodDates, salesPeriods, salesRange, shopDate,
} from "./period";

describe("shop reporting periods", () => {
  it("only applies complete, valid ranges within the existing SQL limit", () => {
    expect(dateRangeError("", "2026-11-02")).toContain("Choose both dates");
    expect(dateRangeError("2026-11-02", "")).toContain("Choose both dates");
    for (const invalid of ["not-a-date", "2026-02-30", "2026-02-29", "0000-01-01"]) {
      expect(dateRangeError(invalid, "2026-11-02")).toBe("Choose valid dates.");
    }
    expect(dateRangeError("2024-02-29", "2024-02-29")).toBeNull();
    expect(dateRangeError("2026-11-03", "2026-11-02")).toContain("on or after");
    expect(dateRangeError("2026-01-01", "2027-01-02")).toBeNull();
    expect(dateRangeError("2026-01-01", "2027-01-03")).toContain("up to one year");
  });
  it("uses the shop's calendar date, including year boundaries", () => {
    const now = new Date("2026-01-01T00:30:00Z");
    expect(shopDate("Asia/Manila", now)).toBe("2026-01-01");
    expect(shopDate("America/Los_Angeles", now)).toBe("2025-12-31");
    expect(salesRange({ period: "week" }, "2026-01-01")).toEqual({
      period: "week",
      from: "2025-12-29",
      to: "2026-01-01",
    });
  });
  it("calculates Monday-to-date weeks, month-to-date and leap day yesterday", () => {
    expect(salesRange({ period: "week" }, "2026-11-08").from).toBe(
      "2026-11-02",
    );
    expect(salesRange({ period: "week" }, "2026-11-02")).toEqual({
      period: "week",
      from: "2026-11-02",
      to: "2026-11-02",
    });
    expect(salesRange({ period: "month" }, "2026-12-31")).toEqual({
      period: "month",
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(salesRange({ period: "yesterday" }, "2024-03-01").from).toBe(
      "2024-02-29",
    );
    expect(salesRange({ period: "yesterday" }, "2026-03-01").from).toBe(
      "2026-02-28",
    );
    expect(salesRange({ period: "yesterday" }, "2026-03-09").from).toBe(
      "2026-03-08",
    );
    expect(salesPeriods("2026-11-02").map((period) => period.id)).toEqual([
      "today",
      "yesterday",
      "week",
      "month",
    ]);
  });
  it("preserves custom date links and rejects normalized invalid calendar dates", () => {
    expect(
      salesRange({ from: "2026-09-01", to: "2026-09-30" }, "2026-11-02"),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30", period: undefined });
    expect(
      salesRange({ from: "2026-02-30", to: "not-a-date" }, "2026-11-02"),
    ).toEqual({ from: "2026-11-02", to: "2026-11-02", period: "today" });
    expect(periodDates("2026-11-02", "2026-11-02")).toBe("Nov 2, 2026");
  });
});
