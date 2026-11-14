import { describe, expect, it } from "vitest";
import { accessFor, can, permissionModules } from "./permissions";
import { permissionsSchema } from "@/lib/users/domain";
describe("module and action permissions", () => {
  it("keeps owner access and existing staff access during rollout", () => {
    for (const definition of permissionModules) for (const action of definition.actions) expect(can(accessFor("founder", {}), definition.key, action)).toBe(true);
    expect(can(accessFor("staff"), "pos", "checkout")).toBe(true);
    expect(can(accessFor("staff"), "menu", "edit")).toBe(false);
    expect(can(accessFor("staff"), "inventory")).toBe(false);
    expect(can(accessFor("founder"), "users")).toBe(true);
    expect(can(accessFor("staff", { users: ["view"] }), "users")).toBe(false);
  });
  it("treats an empty map as no access and requires View alongside actions", () => {
    expect(can(accessFor("staff", {}), "pos")).toBe(false);
    expect(can(accessFor("staff", { menu: ["edit"] }), "menu", "edit")).toBe(false);
    const access = accessFor("staff", { menu: ["view", "create"] });
    expect(can(access, "menu", "create")).toBe(true);
    expect(can(access, "menu", "edit")).toBe(false);
    expect(can(access, "menu", "delete")).toBe(false);
    expect(can(access, "pos")).toBe(false);
  });
  it.each([{ users: ["view"] }, { pos: ["view", "delete"] }, { menu: ["edit"] }, { menu: ["view", "view"] }, { menu: "view" }])("rejects invalid permission maps: %j", value => {
    expect(permissionsSchema.safeParse(value).success).toBe(false);
  });
  it("accepts a valid restricted map", () => {
    expect(permissionsSchema.parse({ inventory: ["view", "stock"], expenses: ["view", "create"] })).toEqual({ inventory: ["view", "stock"], expenses: ["view", "create"] });
  });
});
