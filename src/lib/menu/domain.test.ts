import { describe, expect, it } from "vitest";
import {
  isAvailable,
  priceRange,
  productSchema,
  defaultSizeId,
} from "./domain";
import { addLine, cartIssue, reviewLine } from "../pos/cart";
import { checkoutSchema } from "../sales/domain";

const id = "00000000-0000-4000-8000-000000000001";
const small = "00000000-0000-4000-8000-000000000002";
const large = "00000000-0000-4000-8000-000000000003";
const product = {
  id,
  name: "Latte",
  price_cents: 12000,
  cost_cents: 4000,
  active: true,
  sizes: [
    {
      id: small,
      label: "12 oz",
      price_cents: 12000,
      cost_cents: 4000,
      active: true,
      is_default: true,
    },
    {
      id: large,
      label: "16 oz",
      price_cents: 14500,
      cost_cents: 5000,
      active: true,
      is_default: false,
    },
  ],
};
describe("Menu and size integrity", () => {
  it("supports regular products and custom single/multiple sizes", () => {
    expect(productSchema.safeParse({ ...product, sizes: [] }).success).toBe(
      true,
    );
    expect(
      productSchema.safeParse({ ...product, sizes: [product.sizes[0]] })
        .success,
    ).toBe(true);
    expect(productSchema.safeParse(product).success).toBe(true);
    expect(priceRange(product)).toEqual({ min: 12000, max: 14500 });
  });
  it("rejects duplicate labels, invalid prices/IDs and missing defaults", () => {
    for (const sizes of [
      [product.sizes[0], { ...product.sizes[1], label: " 12 OZ " }],
      [product.sizes[0], { ...product.sizes[1], id: small }],
      [{ ...product.sizes[0], price_cents: -1 }],
      [{ ...product.sizes[0], price_cents: 1.5 }],
      [{ ...product.sizes[0], is_default: false }],
      [{ ...product.sizes[0], label: " " }],
    ])
      expect(productSchema.safeParse({ ...product, sizes }).success).toBe(
        false,
      );
  });
  it("limits image protocols to HTTPS or local image paths", () => {
    for (const image_url of [
      "https://example.com/latte.jpg",
      "/images/latte.jpg",
      null,
    ])
      expect(productSchema.safeParse({ ...product, image_url }).success).toBe(
        true,
      );
    for (const image_url of [
      "javascript:alert(1)",
      "data:image/svg+xml,test",
      "//example.com/tracker",
      "/",
    ])
      expect(productSchema.safeParse({ ...product, image_url }).success).toBe(
        false,
      );
  });
  it("separates sizes and merges only identical selections", () => {
    let cart = addLine([], product, small);
    cart = addLine(cart, product, large);
    cart = addLine(cart, product, small);
    expect(cart).toHaveLength(2);
    expect(
      cart.map((line) => [line.size_label, line.quantity, line.price_cents]),
    ).toEqual([
      ["12 oz", 2, 12000],
      ["16 oz", 1, 14500],
    ]);
    const items = cart.map((line) => ({
      product_id: line.product_id,
      size_id: line.size_id,
      quantity: line.quantity,
      price_cents: line.price_cents,
    }));
    expect(
      checkoutSchema.safeParse({ id, method: "cash", items }).success,
    ).toBe(true);
    expect(
      checkoutSchema.safeParse({
        id,
        method: "cash",
        items: [items[0], items[0]],
      }).success,
    ).toBe(false);
  });
  it("preserves cart snapshots until a changed price is explicitly reviewed", () => {
    const cart = addLine([], product, small);
    const changed = {
      ...product,
      sizes: [{ ...product.sizes[0], price_cents: 13000 }, product.sizes[1]],
    };
    expect(cart[0].price_cents).toBe(12000);
    expect(cartIssue(cart[0], [changed])).toContain("changed");
    expect(() => addLine(cart, changed, small)).toThrow("Review");
    expect(reviewLine(cart[0], [changed])?.price_cents).toBe(13000);
    expect(
      cartIssue(cart[0], [
        {
          ...product,
          sizes: [{ ...product.sizes[0], label: "New size" }, product.sizes[1]],
        },
      ]),
    ).toContain("changed");
  });
  it("blocks removed/inactive options without losing existing cart details", () => {
    const cart = addLine([], product, small);
    const changed = {
      ...product,
      sizes: [{ ...product.sizes[0], active: false }, product.sizes[1]],
    };
    expect(defaultSizeId(changed)).toBe(large);
    expect(isAvailable(changed)).toBe(true);
    expect(() => addLine([], changed, small)).toThrow();
    expect(cartIssue(cart[0], [changed])).toContain("no longer available");
    expect(reviewLine(cart[0], [changed])).toBeUndefined();
    expect(cartIssue(cart[0], [])).toContain("no longer available");
    expect(isAvailable({ ...product, active: false })).toBe(false);
    expect(
      isAvailable({ ...product, archived_at: new Date().toISOString() }),
    ).toBe(false);
  });
});
