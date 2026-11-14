export const workspaceModules = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "business" },
  { key: "pos", label: "POS", href: "/pos", icon: "dashboard" },
  { key: "menu", label: "Menu", href: "/app/menu", icon: "menu" },
  { key: "inventory", label: "Inventory", href: "/app/inventory", icon: "inventory" },
  { key: "sales", label: "Sales", href: "/app/sales", icon: "sales" },
  { key: "expenses", label: "Expenses", href: "/expenses", icon: "wallet" },
  { key: "libraries", label: "Libraries", href: "/libraries", icon: "libraries" },
  { key: "users", label: "Users", href: "/app/users", icon: "users" },
] as const;

export type WorkspaceModule = typeof workspaceModules[number]["key"];
export const workspaceModule = (path: string) => workspaceModules.find(item => item.href === path)?.key;
