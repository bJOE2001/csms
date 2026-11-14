import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { afterEach, describe, expect, it, vi } from "vitest";
import { featuredProducts, projectPublicMenu, publicMenuSchema, topSellingProductIds } from "./public-menu";
import { coffeeShopSchema, publicMetadata } from "./seo";
import { visitDetails } from "./config";
import type { Product } from "@/lib/menu/domain";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const product: Product = { id: id(1), name: "Latte", description: "Coffee and milk", price_cents: 12000, cost_cents: 5000, active: true, category_id: id(5), sizes: [
  { id: id(2), label: "Small", price_cents: 12000, cost_cents: 5000, active: true, is_default: true },
  { id: id(3), label: "Large", price_cents: 14500, cost_cents: 6000, active: true, is_default: false },
  { id: id(4), label: "Unavailable", price_cents: 17000, cost_cents: 7000, active: false, is_default: false },
] };
afterEach(() => vi.unstubAllEnvs());
describe("public storefront data boundary", () => {
  it("publishes only customer fields, including nested sizes", () => {
    const [item] = projectPublicMenu([product], [{ id: id(5), name: "Coffee" }]);
    expect(item).toEqual({ id: id(1), name: "Latte", description: "Coffee and milk", category: "Coffee", image: null, price: 12000, sizes: [{ label: "Small", price: 12000 }, { label: "Large", price: 14500 }] });
    expect(JSON.stringify(item)).not.toMatch(/cost|shop_id|created_by|is_default|size_id|profit/);
  });
  it("uses existing availability rules without exposing archived or disabled selections", () => {
    expect(projectPublicMenu([{ ...product, active: false }, { ...product, archived_at: "2026-11-01" }, { ...product, sizes: product.sizes!.map(size => ({ ...size, active: false })) }], [])).toEqual([]);
    expect(projectPublicMenu([{ ...product, sizes: [] }], [])[0].price).toBe(12000);
  });
  it("validates prices and rejects malformed or extra API fields", () => {
    expect(() => projectPublicMenu([{ ...product, price_cents: -1, sizes: [] }], [])).toThrow();
    const data = { status: "published", products: projectPublicMenu([product], []) };
    expect(publicMenuSchema.safeParse(data).success).toBe(true);
    expect(publicMenuSchema.safeParse({ ...data, cost_cents: 100 }).success).toBe(false);
  });
  it("rejects private local image routes and unsafe protocols", () => {
    for (const image_url of ["/api/pos", "/images/../api/pos", "javascript:alert(1)", "//other.example/image.jpg"]) expect(projectPublicMenu([{ ...product, image_url }], [])[0].image).toBeNull();
    expect(projectPublicMenu([{ ...product, image_url: "/site/iced-coffee.webp" }], [])[0].image).toBe("/site/iced-coffee.webp");
  });
  it("selects only actual available products, ranks completed POS top sellers, and fills remaining slots cleanly", () => {
    const products = projectPublicMenu(Array.from({ length: 10 }, (_, n) => ({ ...product, id: id(n + 10), name: `Coffee ${n}`, image_url: n === 7 ? "/site/iced-coffee.webp" : undefined })), []);
    expect(featuredProducts(products, [id(18), id(18), id(999)])[0].id).toBe(id(18));
    expect(featuredProducts(products)).toHaveLength(4);
    expect(featuredProducts(products)[0].id).toBe(id(17));
    expect(products[0].id).toBe(id(10));

    const topIds = topSellingProductIds(products, [
      { status: "completed", items: [{ product_id: id(12), name: "Coffee 2", quantity: 5, line_total_cents: 60000 }, { product_id: id(14), name: "Coffee 4", quantity: 2, line_total_cents: 24000 }] },
      { status: "refunded", items: [{ product_id: id(10), name: "Coffee 0", quantity: 99, line_total_cents: 990000 }] },
      { status: "completed", items: [{ name: "Coffee 4", quantity: 4, line_total_cents: 48000 }, { name: "Unavailable", quantity: 10, line_total_cents: 10000 }] },
    ]);
    expect(topIds).toEqual([id(14), id(12)]);
    expect(featuredProducts(products, [], topIds).map(item => item.id)).toEqual([id(14), id(12), id(17), id(10)]);
    expect(publicMenuSchema.safeParse({ status: "published", products, featured_ids: topIds }).success).toBe(true);
  });
  it("keeps owner-confirmed visit facts and omits fictional contact channels and operating days", () => {
    for (const key of ["SITE_ADDRESS", "SITE_OPENING_HOURS", "SITE_CONTACT_PHONE", "SITE_CONTACT_EMAIL", "SITE_DIRECTIONS_URL", "SITE_ORDERING_URL", "SITE_INSTAGRAM_URL", "SITE_FACEBOOK_URL"]) vi.stubEnv(key, "");
    const visit = visitDetails();
    expect(visit.address).toBe("Purok 6, Ising, Carmen, Davao del Norte");
    expect(visit.hours).toBe("5:00 PM–9:00 PM");
    expect(visit.email).toBeUndefined(); expect(visit.phone).toBeUndefined(); expect(visit.ordering).toBeUndefined();
    expect(visit.directions).toBe("https://maps.app.goo.gl/JFPkDck15BBvFdLe9");
    expect(coffeeShopSchema()).not.toHaveProperty("openingHours");
    expect(coffeeShopSchema()).not.toHaveProperty("aggregateRating");
    expect(coffeeShopSchema()).not.toHaveProperty("geo");
    expect(coffeeShopSchema().name).toBe("Sip&Snap");
    expect(coffeeShopSchema().hasMap).toBe(visit.directions);
  });
  it("uses only configured public origins for canonical and social URLs", () => {
    vi.stubEnv("SITE_URL", "");
    expect(publicMetadata("Menu", "Our menu", "/menu").alternates).toBeUndefined();
    vi.stubEnv("SITE_URL", "https://coffee.example");
    expect(publicMetadata("Menu", "Our menu", "/menu").alternates).toEqual({ canonical: "https://coffee.example/menu" });
    expect(publicMetadata("Menu", "Our menu", "/menu").openGraph).toMatchObject({ siteName: "Sip&Snap", url: "https://coffee.example/menu" });
    expect(publicMetadata("Menu", "Our menu", "/menu").openGraph).not.toHaveProperty("images");
    expect(publicMetadata("Menu", "Our menu", "/menu").twitter).toMatchObject({ card: "summary" });
    expect(coffeeShopSchema()).not.toHaveProperty("logo");
    expect(coffeeShopSchema()).not.toHaveProperty("image");
    expect(sitemap().map(entry => entry.url)).toEqual(["https://coffee.example/", "https://coffee.example/menu", "https://coffee.example/visit"]);
    expect(robots().sitemap).toBe("https://coffee.example/sitemap.xml");
    expect(robots().rules).toMatchObject({ allow: expect.arrayContaining(["/menu"]), disallow: expect.arrayContaining(["/app"]) });
    expect((robots().rules as { disallow: string[] }).disallow).not.toContain("/menu");
    expect(coffeeShopSchema().hasMenu).toBe("https://coffee.example/menu");
  });
});
