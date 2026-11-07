import { expect, test } from "@playwright/test";
import type { InventoryData } from "../../src/lib/inventory/domain";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

for (const width of [1440, 1032]) {
  test(`inventory and recipe costs display two decimals at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const data: InventoryData = {
      items: [{ id: uid(1), name: "Ground Coffee", item_type: "ingredient", base_unit: "g",
        minimum_stock: "100", notes: "", active: true, quantity: "9140", value_cents: 555971,
        unit_cost_cents: "60.8283", revision: 1, has_movements: true }],
      movements: [], returnable: [],
      configs: [{ product_id: uid(2), size_key: "", revision: 1, draft: null, active: {
        id: uid(3), mode: "recipe", version: 1, cost_cents: 1095, max_quantity: 507,
        components: [{ ingredient_id: uid(1), name: "Ground Coffee", base_unit: "g",
          quantity: "18", active: true, unit_cost_cents: "60.8283", component_cost_cents: "1094.9101" }],
      } }],
    };
    await page.route("**/api/inventory*", route => route.fulfill({ json: { data } }));
    await page.route("**/api/pos", route => route.fulfill({ json: {
      shop: { id: uid(9), name: "LOGO" }, founder: true, user_id: uid(9), categories: [],
      products: [{ id: uid(2), name: "Americano", price_cents: 9500, active: true, sizes: [],
        inventory: { regular: { state: "active", max_quantity: 507, cost_cents: 1095 } } }],
    } }));
    await page.goto("/app/inventory");
    const row = page.getByRole("row", { name: "Open Ground Coffee details" });
    await expect(row).toContainText("₱0.61");
    await expect(row).not.toContainText("₱0.608283");
    await page.screenshot({ path: `.local/ui-review/inventory/costs-${width}.png` });
    await page.goto("/app/menu");
    await page.getByRole("button", { name: "Manage Recipe for Americano", exact: true }).click();
    const breakdown = page.getByRole("region", { name: "Saved recipe cost breakdown", exact: true });
    await breakdown.getByText("Saved recipe breakdown", { exact: true }).click();
    await expect(breakdown.getByRole("cell", { name: "₱10.95", exact: true })).toBeVisible();
    await expect(breakdown).not.toContainText("₱10.949101");
    await expect(breakdown).toContainText("₱84.05");
    await page.screenshot({ path: `.local/ui-review/inventory/recipe-costs-${width}.png` });
  });
}
