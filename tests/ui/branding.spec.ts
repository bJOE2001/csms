import { expect, test, type Page } from "@playwright/test";
import { chooseOption } from "../helpers/select";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const screens = [
  { path: "/pos", name: "POS", heading: "Product menu" },
  { path: "/menu", name: "Menu", heading: "Menu Management" },
  { path: "/app/sales", name: "Sales", heading: "Sales" },
  { path: "/expenses", name: "Expenses", heading: "Expenses Management" },
  { path: "/libraries", name: "Libraries", heading: "Libraries" },
];
async function catalog(page: Page) {
  await page.route("**/api/pos", route => route.fulfill({ json: {
    shop: { id: uid(1), name: "Common Ground Coffee" }, founder: true, user_id: uid(1),
    categories: [{ id: uid(2), name: "Coffee" }],
    products: Array.from({ length: 12 }, (_, i) => ({
      id: uid(10 + i), name: i ? `Coffee ${i}` : "Latte", category_id: uid(2),
      description: "Freshly prepared coffee.", price_cents: 14500, cost_cents: 5000, active: true,
      sizes: i ? [] : [
        { id: uid(30), label: "12 oz", price_cents: 14500, cost_cents: 5000, active: true, is_default: true },
        { id: uid(31), label: "16 oz", price_cents: 16500, cost_cents: 6000, active: true, is_default: false },
      ],
    })),
  } }));
}

function contrast(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1032, height: 1376 },
  { width: 960, height: 1440 }, { width: 768, height: 1024 }, { width: 393, height: 844 },
]) {
  test(`official logo and brand navigation stay consistent at ${viewport.width}px`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await catalog(page);
    const errors: string[] = [];
    let headerHeight: number | undefined;
    page.on("pageerror", error => errors.push(error.message));
    for (const screen of screens) {
      await page.goto(screen.path);
      await expect(page.getByRole("heading", { name: screen.heading, exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const sidebar = page.locator(viewport.width >= 1280 ? ".workspace-sidebar" : ".workspace-mobile-header");
      const currentHeaderHeight = (await sidebar.boundingBox())!.height;
      if (headerHeight === undefined) headerHeight = currentHeaderHeight;
      expect(currentHeaderHeight).toBe(headerHeight);
      const logo = sidebar.getByRole("img", { name: "LOGO Coffee", exact: true });
      await expect(logo).toHaveAttribute("src", "/images/LogoWithWhiteStoke.png");
      await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1774 && image.naturalHeight === 887)).toBe(true);
      await expect(logo).toHaveCSS("object-fit", "contain");
      await expect(logo).toHaveCSS("filter", "none");
      await expect(logo).toHaveCSS("transform", "none");
      const imageBox = (await logo.boundingBox())!;
      expect(Math.abs(imageBox.width / imageBox.height - 2)).toBeLessThan(0.01);
      const artwork = sidebar.locator(".brand-artwork");
      await expect(artwork).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(artwork).toHaveCSS("background-image", "none");
      await expect(artwork).toHaveCSS("border-width", "0px");
      await expect(artwork).toHaveCSS("border-radius", "0px");
      await expect(artwork).toHaveCSS("box-shadow", "none");
      await expect(artwork).toHaveCSS("padding", "0px");
      await expect(logo).toHaveCSS("box-shadow", "none");
      await expect(sidebar).toHaveCSS("background-color", "rgb(59, 27, 18)");
      if (viewport.width < 1280) {
        await expect(page.getByRole("navigation", { name: "Shop", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
        await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
        const drawerLogo = page.getByRole("dialog", { name: "Navigation menu", exact: true }).locator(".brand-artwork");
        await expect(drawerLogo).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(drawerLogo).toHaveCSS("box-shadow", "none");
        await expect(drawerLogo.locator("img")).toHaveAttribute("src", "/images/LogoWithWhiteStoke.png");
      }
      const nav = page.getByRole("navigation", { name: "Shop", exact: true });
      await expect(nav.getByRole("link")).toHaveCount(5);
      const active = nav.getByRole("link", { name: screen.name, exact: true });
      await expect(active).toHaveAttribute("aria-current", "page");
      await expect(active).toHaveCSS("background-color", "rgb(242, 161, 94)");
      await expect(active).toHaveCSS("color", "rgb(59, 27, 18)");
      await expect(active.locator("svg")).toHaveCSS("color", "rgb(59, 27, 18)");
      const workspace = page.locator(screen.name === "POS" ? ".pos-menu" : ".workspace-shell > .workspace-content");
      await expect(workspace).toHaveCSS("background-color", "rgb(250, 247, 243)");
      const signOut = page.locator(viewport.width >= 1280 ? ".workspace-sidebar form" : ".workspace-navigation-drawer form");
      await expect(signOut).toHaveAttribute("action", "/auth/sign-out");
      await expect(signOut).toHaveAttribute("method", "post");
      if (viewport.width >= 1280) {
        const sidebarBox = (await sidebar.boundingBox())!;
        expect(sidebarBox.width).toBe(216);
        expect(sidebarBox.height).toBe(viewport.height);
      } else {
        await expect(nav).toHaveCSS("display", "grid");
        await expect(active).toBeInViewport();
        await page.getByRole("dialog", { name: "Navigation menu", exact: true })
          .getByRole("button", { name: "Close navigation menu", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Navigation menu", exact: true })).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width >= 768 || screen.name === "POS")
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(viewport.height);
      if (screen.name === "POS" || viewport.width === 1440 || viewport.width === 393)
        await page.screenshot({ path: info.outputPath(`${screen.name}-${viewport.width}.png`) });
    }
    expect(errors).toEqual([]);
  });
}

test("brand buttons, controls, statuses and focus retain readable contrast", async ({ page }) => {
  await catalog(page);
  await page.goto("/menu");
  const add = page.getByRole("button", { name: "Add product", exact: true });
  await expect(add).toHaveCSS("background-color", "rgb(242, 161, 94)");
  await expect(add).toHaveCSS("color", "rgb(59, 27, 18)");
  await add.click();
  const save = page.getByRole("button", { name: "Save product", exact: true });
  await expect(save).toHaveCSS("background-color", "rgb(59, 27, 18)");
  await expect(save).toHaveCSS("color", "rgb(255, 255, 255)");
  await page.keyboard.press("Tab");
  await save.focus();
  await expect(save).toHaveCSS("outline-color", "rgb(117, 68, 45)");
  await expect(save).toHaveCSS("outline-width", "3px");
  expect(await save.evaluate(node => getComputedStyle(node).getPropertyValue("--tw-ring-shadow").trim())).toBe("0 0 #0000");
  const input = page.getByLabel("Product name", { exact: true });
  await input.focus();
  await expect(input).toHaveCSS("outline-color", "rgb(117, 68, 45)");
  await expect(input).toHaveCSS("outline-width", "2px");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const selector of [".hint", ".menu-status-available", ".table-action-button", ".select-trigger"]) {
    const element = page.locator(selector).first();
    const colors = await element.evaluate(node => {
      const css = getComputedStyle(node);
      let parent: Element | null = node;
      let background = css.backgroundColor;
      while (background === "rgba(0, 0, 0, 0)" && (parent = parent.parentElement))
        background = getComputedStyle(parent).backgroundColor;
      return { foreground: css.color, background, border: css.borderColor };
    });
    expect(contrast(colors.foreground, colors.background)).toBeGreaterThanOrEqual(4.5);
    if (selector === ".select-trigger") expect(contrast(colors.border, colors.background)).toBeGreaterThanOrEqual(3);
  }
  const category = page.getByRole("combobox", { name: "Category", exact: true });
  await category.focus();
  await page.keyboard.press("ArrowDown");
  const option = page.getByRole("option", { name: "Coffee", exact: true });
  await option.focus();
  await expect(option).toHaveCSS("background-color", "rgb(255, 228, 198)");
  await page.keyboard.press("Escape");
  await chooseOption(page, category, "All categories");
  await page.getByRole("button", { name: "Delete product Coffee 1", exact: true }).click();
  const destructive = page.getByRole("alertdialog").getByRole("button", { name: "Delete product", exact: true });
  const destructiveColors = await destructive.evaluate(node => {
    const css = getComputedStyle(node); return { foreground: css.color, background: css.backgroundColor };
  });
  expect(destructiveColors.background).not.toBe("rgb(242, 161, 94)");
  expect(contrast(destructiveColors.foreground, destructiveColors.background)).toBeGreaterThanOrEqual(4.5);
});
