type Summary = Record<string, unknown>;
type NextStep = { title: string; description: string; href: string; action: string; icon: string };
export function getNextStep(summary: Summary, role: string): NextStep {
  if (role !== "founder") return { title: "Start with your cashier shift", description: "Check your assigned device and opening cash, then continue to the POS to take orders.", href: "/app/shifts", action: "View cashier shifts", icon: "shifts" };
  if (!Number(summary.products)) return { title: "Start with your menu", description: "Create a category and your first product. You can prepare everything before opening day.", href: "/app/menu", action: "Set up your menu", icon: "menu" };
  if (!Number(summary.ingredients)) return { title: "Add your ingredients and recipes", description: "Define what goes into each serving so sales can deduct the right quantities from stock.", href: "/app/recipes", action: "Set up recipes", icon: "recipes" };
  if (!Number(summary.available_variants)) return { title: "Make your menu available", description: "Review each recipe and selling price, then enable the variants you want to sell. Sample items start disabled.", href: "/app/menu", action: "Review menu availability", icon: "menu" };
  if (!Number(summary.stock_entries)) return { title: "Record what is on your shelves", description: "Enter a physical opening count, or receive an actual delivery. Ingredient setup alone does not create stock.", href: "/app/inventory", action: "Record opening stock", icon: "inventory" };
  return { title: "Prepare your till for the day", description: "Review your stock and available menu, then open a shift on your registered POS device.", href: "/app/shifts", action: "Open or review a shift", icon: "shifts" };
}
