import { describe, expect, it } from "vitest";
import { addCents, asCents, centsToDecimal, formatPhp } from "@/lib/money";

describe("centavo money helpers", () => {
  it("provides exact editable decimal text without a floating-point conversion", () => {
    expect(centsToDecimal(asCents(15005))).toBe("150.05");
    expect(centsToDecimal(asCents(Number.MAX_SAFE_INTEGER))).toBe("90071992547409.91");
  });
  it("adds integer-centavo amounts without floating-point arithmetic", () => {
    expect(addCents(asCents(10), asCents(25))).toBe(35);
  });

  it("rejects fractional and negative currency values", () => {
    expect(() => asCents(1.5)).toThrow();
    expect(() => asCents(-1)).toThrow();
  });

  it("rejects totals outside JavaScript's safe integer range", () => {
    expect(() => addCents(asCents(Number.MAX_SAFE_INTEGER), asCents(1))).toThrow(RangeError);
  });

  it("formats PHP using centavos only at the display boundary", () => {
    expect(formatPhp(asCents(1250), "en-US")).toBe("₱12.50");
  });
});
