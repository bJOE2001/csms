import { describe, expect, it } from "vitest";
import { workspaceModule, workspaceModules } from "./workspace";

describe("public and staff menu route ownership", () => {
  it("assigns only the staff menu to the persistent workspace shell", () => {
    expect(workspaceModules.find(item => item.key === "menu")?.href).toBe("/app/menu");
    expect(workspaceModule("/app/menu")).toBe("menu");
    for (const path of ["/", "/menu", "/coffee-menu", "/visit"])
      expect(workspaceModule(path)).toBeUndefined();
  });
});
