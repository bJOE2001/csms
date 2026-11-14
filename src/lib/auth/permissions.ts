/** Module access and the operations that can be delegated to staff. */
export const permissionModules = [
  { key: "dashboard", label: "Dashboard", actions: ["view"] },
  { key: "pos", label: "POS", actions: ["view", "checkout"] },
  { key: "menu", label: "Menu", actions: ["view", "create", "edit", "delete"] },
  { key: "inventory", label: "Inventory", actions: ["view", "create", "edit", "stock", "recipe", "return"] },
  { key: "sales", label: "Sales", actions: ["view", "refund", "print", "export"] },
  { key: "expenses", label: "Expenses", actions: ["view", "create", "edit", "delete"] },
  { key: "libraries", label: "Libraries", actions: ["view", "create", "edit", "delete"] },
] as const;

export type PermissionModule = typeof permissionModules[number]["key"];
export type PermissionAction = typeof permissionModules[number]["actions"][number];
export type Permissions = Partial<Record<PermissionModule, PermissionAction[]>>;
export type MemberAccess = { role: "founder" | "staff"; permissions: Permissions | null };
export const actionLabels: Record<PermissionAction, string> = {
  view: "View", create: "Add", edit: "Edit", delete: "Delete", checkout: "Complete sales",
  stock: "Manage stock", recipe: "Manage recipes", return: "Return stock",
  refund: "Refund", print: "Print receipts", export: "Export",
};

// Null preserves existing staff access during the additive rollout. An empty
// object explicitly grants nothing; newly invited staff get an explicit map.
export const legacyStaffPermissions: Permissions = {
  pos: ["view", "checkout"], menu: ["view"], libraries: ["view"],
  sales: ["view", "print", "export"], expenses: ["view"],
};
export function can(access: MemberAccess | null | undefined, module: PermissionModule | "users", action: PermissionAction = "view") {
  if (!access) return false;
  if (access.role === "founder") return true;
  if (module === "users") return false;
  const definition = permissionModules.find(item => item.key === module);
  if (!definition?.actions.some(value => value === action)) return false;
  const granted = (access.permissions ?? legacyStaffPermissions)[module] ?? [];
  return granted.includes("view") && granted.includes(action);
}
export function accessFor(role: "founder" | "staff", permissions?: unknown): MemberAccess {
  return { role, permissions: permissions == null ? null : permissions as Permissions };
}
