import type { Product } from "@/lib/menu/domain";
import { isAvailable } from "@/lib/menu/domain";
import { money } from "@/lib/sales/domain";
import { Icon } from "../ui/icon";
import { Button } from "../ui/button";
import { ProductThumbnail } from "./product-thumbnail";

export function ProductCard({
  product,
  quantity,
  disabled,
  sizeId,
  onSizeChange,
  onAdd,
}: {
  product: Product;
  quantity: number;
  disabled: boolean;
  sizeId?: string;
  onSizeChange: (sizeId: string) => void;
  onAdd: () => void;
}) {
  const selected = product.sizes?.find((size) => size.id === sizeId);
  const price = selected?.price_cents ?? product.price_cents;
  const available =
    isAvailable(product) && (!product.sizes?.length || !!selected?.active);
  return (
    <article
      className={`product-card ${available ? "" : "product-card-unavailable"}`}
    >
      <div className="pos-product">
        <ProductThumbnail name={product.name} imageUrl={product.image_url} />
        <div className="product-info">
          <div className="product-title">
            <strong>{product.name}</strong>
            <span className="product-price">{money(price)}</span>
          </div>
          {product.description && (
            <p className="product-description">{product.description}</p>
          )}
          {product.sizes?.length ? (
            <label className="product-size-field">
              <span className="sr-only">Size for {product.name}</span>
              <select
                aria-label={`Size for ${product.name}`}
                value={sizeId ?? ""}
                disabled={disabled || !product.active}
                onChange={(event) => onSizeChange(event.target.value)}
              >
                {!selected && <option value="">No available sizes</option>}
                {product.sizes.map((size) => (
                  <option key={size.id} value={size.id} disabled={!size.active}>
                    {size.label}
                    {!size.active ? " — Unavailable" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="product-availability">
              {available ? "Available" : "Unavailable"}
            </span>
          )}
        </div>
        <div className="product-card-footer">
          <span className="product-order-count">
            {quantity ? (
              <>
                <Icon name="check" size={14} />
                {quantity} in order
              </>
            ) : (
              "Per item"
            )}
          </span>
          <Button
            className={`product-add ${quantity ? "product-added" : ""}`}
            variant={quantity ? "default" : "outline"}
            aria-label={`${product.name}${selected ? ` ${selected.label}` : ""} ${money(price)} · ${quantity ? "Add another" : "Add to order"}`}
            disabled={!available || disabled}
            onClick={onAdd}
          >
            {quantity ? "Add another" : "Add to order"}
            <Icon name="plus" size={14} />
          </Button>
        </div>
      </div>
    </article>
  );
}
