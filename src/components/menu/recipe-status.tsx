import type { ProductInventoryStatus } from "@/lib/menu/domain";

const statusClasses: Record<ProductInventoryStatus, string> = {
  Active: "menu-inventory-active",
  Draft: "menu-inventory-draft",
  "Needs Attention": "menu-inventory-attention",
  "Recipe Not Configured": "menu-inventory-unconfigured",
};

export function RecipeStatus({ status }: { status: ProductInventoryStatus }) {
  return (
    <span
      className={`menu-inventory-status ${statusClasses[status]}`}
      title="Recipe readiness; availability also depends on stock and selling settings."
    >
      {status === "Active" ? "Recipe Active" : status === "Recipe Not Configured" ? "Not Configured" : status}
    </span>
  );
}
