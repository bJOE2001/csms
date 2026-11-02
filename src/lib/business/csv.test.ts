import{describe,it,expect}from "vitest";
import{csvCell}from "./csv";
describe("financial CSV export",()=>{
  it("escapes formula text even after leading whitespace",()=>{expect(csvCell(" =SUM(A1:A2)")).toBe('"\' =SUM(A1:A2)"');expect(csvCell("@HYPERLINK")).toBe('"\'@HYPERLINK"');});
  it("retains real negative monetary numbers as numbers",()=>{expect(csvCell(-100)).toBe('"-100"');expect(csvCell(15005)).toBe('"15005"');});
  it("quotes separators, newlines and embedded quotes",()=>{expect(csvCell('Coffee, "milk"\nstock')).toBe('"Coffee, ""milk""\nstock"');expect(csvCell(null)).toBe('""');});
});
