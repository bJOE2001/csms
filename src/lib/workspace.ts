export const workspaceModules = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "business" },
  { key: "pos", label: "POS", href: "/pos", icon: "dashboard" },
  { key: "menu", label: "Menu", href: "/menu", icon: "menu" },
  { key: "sales", label: "Sales", href: "/app/sales", icon: "sales" },
  { key: "expenses", label: "Expenses", href: "/expenses", icon: "wallet" },
  { key: "libraries", label: "Libraries", href: "/libraries", icon: "libraries" },
] as const;

export type WorkspaceModule = typeof workspaceModules[number]["key"];
export const workspaceModule = (path: string) => workspaceModules.find(item => item.href === path)?.key;
