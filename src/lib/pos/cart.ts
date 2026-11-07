import { saleOption, type Product } from "../menu/domain";

export type CartLine = {
  key: string;
  product_id: string;
  name: string;
  size_id?: string;
  size_label?: string;
  price_cents: number;
  quantity: number;
  image_url?: string | null;
};
export const lineKey = (productId: string, sizeId?: string) =>
  `${productId}:${sizeId ?? ""}`;
export function cartIssue(line: CartLine, products: Product[]) {
  const product = products.find((item) => item.id === line.product_id);
  const option = product && saleOption(product, line.size_id);
  if (!option)
    return "This product or size is no longer available. Remove it to continue.";
  const inventory = product!.inventory?.[line.size_id ?? "regular"];
  if (inventory?.state === "active" && line.quantity > (inventory.max_quantity ?? 0))
    return "Not enough tracked stock for this quantity. Reduce it or refresh the menu.";
  if (
    option.price_cents !== line.price_cents ||
    option.size_label !== line.size_label
  )
    return "This menu item changed. Review its current size and price to continue.";
  return undefined;
}
export function addLine(
  lines: CartLine[],
  product: Product,
  sizeId?: string,
): CartLine[] {
  const option = saleOption(product, sizeId);
  if (!option) throw Error("Choose an available product and size.");
  const key = lineKey(product.id, sizeId);
  const existing = lines.find((line) => line.key === key);
  const limit = Math.min(100, product.inventory?.[sizeId ?? "regular"]?.max_quantity ?? 100);
  if (existing && existing.quantity >= limit) throw Error("Not enough tracked stock for another item.");
  if (!existing && lines.length >= 100)
    throw Error("An order can contain up to 100 different items.");
  if (existing && cartIssue(existing, [product]))
    throw Error("Review the changed item in your cart before adding another.");
  return existing
    ? lines.map((line) =>
        line.key === key
          ? { ...line, quantity: Math.min(100, line.quantity + 1) }
          : line,
      )
    : [
        ...lines,
        {
          key,
          product_id: product.id,
          name: product.name,
          image_url: product.image_url,
          ...option,
          quantity: 1,
        },
      ];
}
export function reviewLine(line: CartLine, products: Product[]) {
  const product = products.find((item) => item.id === line.product_id);
  const option = product && saleOption(product, line.size_id);
  return option && product
    ? { ...line, name: product.name, image_url: product.image_url, ...option }
    : undefined;
}
