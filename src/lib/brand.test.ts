import { describe, expect, it } from "vitest";
import { coffeeBrand, displayShopName } from "./brand";
import { salesCsv } from "./sales/csv";

describe("Sip & Snap presentation", () => {
  it("uses the supplied square artwork and exact business name", () => {
    expect(coffeeBrand.name).toBe("Sip & Snap");
    expect(coffeeBrand.logo).toEqual({ src: "/images/Logo.png", width: 1254, height: 1254 });
  });

  it("maps legacy shop aliases for display while preserving distinct branches", () => {
    for (const name of ["LOGO", " LOGO Coffee ", "Coffee Logo", "", "Sip & Snap"])
      expect(displayShopName(name)).toBe("Sip & Snap");
    expect(displayShopName("Carmen Branch")).toBe("Carmen Branch");
    expect(displayShopName("Logo Design Studio")).toBe("Logo Design Studio");
  });

  it("brands report headings without mutating report data", () => {
    const report = { shopName: "LOGO Coffee", timezone: "Asia/Manila", from: "2026-11-01", to: "2026-11-08", sales: [], expenses: [] };
    expect(salesCsv("summary", report)).toContain('"Shop","Sip & Snap"');
    expect(report.shopName).toBe("LOGO Coffee");
  });
});
