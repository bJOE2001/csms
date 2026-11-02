import { describe, expect, it } from "vitest";
import { findWorkspacePages, workspaceGroups } from "./navigation";

describe("workspace discovery", () => {
  it("finds inventory using everyday stock language", () => {
    expect(findWorkspacePages("stock count", "founder").map(page => page.id)).toContain("inventory");
  });
  it("finds purchases through supplier tasks regardless of case", () => {
    expect(findWorkspacePages("  SUPPLIER  ", "founder").map(page => page.id)).toContain("purchases");
  });
  it("never exposes founder pages in staff navigation or search", () => {
    expect(findWorkspacePages("", "staff").map(page => page.id).sort()).toEqual(["dashboard", "orders", "pos", "shifts"]);
    expect(findWorkspacePages("profit", "staff")).toEqual([]);
  });
  it("gives every page one discoverable navigation group", () => {
    const pages = workspaceGroups.flatMap(group => group.pages);
    expect(new Set(pages.map(page => page.href)).size).toBe(pages.length);
    expect(pages.every(page => page.description.length > 15)).toBe(true);
  });
});
