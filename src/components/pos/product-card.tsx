"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { Product } from "@/lib/menu/domain";
import { inventoryAvailable, isAvailable } from "@/lib/menu/domain";
import { optionUnavailableReason } from "@/lib/menu/availability";
import { money } from "@/lib/sales/domain";
import { Icon } from "../ui/icon";
import { Button } from "../ui/button";
import { ProductThumbnail } from "./product-thumbnail";

export function ProductCard({
  product,
  quantity,
  disabled,
  canIncrease = true,
  sizeId,
  onSizeChange,
  onAdd,
  onDecrease,
}: {
  product: Product;
  quantity: number;
  disabled: boolean;
  canIncrease?: boolean;
  sizeId?: string;
  onSizeChange: (sizeId: string) => void;
  onAdd: () => void;
  onDecrease?: () => void;
}) {
  const sizeGroup = useId();
  const card = useRef<HTMLElement>(null);
  const replacementFocus = useRef(false);
  // Retain keyboard focus when the focused action is replaced at quantity 0 or 1.
  useLayoutEffect(() => {
    const restoreFocus = replacementFocus.current;
    replacementFocus.current = false;
    if (restoreFocus)
      card.current?.focus({ preventScroll: true });
  });
  const selected = product.sizes?.find((size) => size.id === sizeId);
  const itemName = `${product.name}${selected ? ` ${selected.label}` : ""}`;
  const price = selected?.price_cents ?? product.price_cents;
  const available =
    isAvailable(product) && inventoryAvailable(product, sizeId) && (!product.sizes?.length || !!selected?.active);
  return (
    <article
      ref={card}
      tabIndex={-1}
      aria-label={product.name}
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
          <div className="product-meta">
            <span className="product-availability">
              {optionUnavailableReason(product, sizeId) ?? "Available"}
            </span>
            {quantity > 0 && (
              <span className="product-cart-quantity">{quantity} in cart</span>
            )}
          </div>
        </div>
        <div className="product-card-footer">
          {!!product.sizes?.length && (
            <fieldset
              className={`product-sizes${product.sizes.length > 6 ? " product-sizes-many" : ""}`}
              disabled={disabled || !product.active}
            >
              <legend className="sr-only">Size for {product.name}</legend>
              {product.sizes.map((size) => (
                <label className="product-size-option" key={size.id}>
                  <input
                    type="radio"
                    name={sizeGroup}
                    value={size.id}
                    checked={size.id === sizeId}
                    disabled={!size.active}
                    onChange={() => onSizeChange(size.id)}
                    aria-label={`${size.label}${!size.active ? " — Unavailable" : ""}`}
                  />
                  <span>{size.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="product-actions">
            {quantity > 0 ? (
              onDecrease ? (
                <div className="product-stepper" role="group" aria-label={`Quantity for ${itemName}`}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="product-stepper-btn"
                    aria-label={`Remove one ${itemName}`}
                    disabled={disabled}
                    onClick={(event) => {
                      if (document.activeElement === event.currentTarget && quantity === 1)
                        replacementFocus.current = true;
                      onDecrease();
                    }}
                  >
                    −
                  </Button>
                  <span className="product-added" aria-live="polite">
                    {quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="product-stepper-btn"
                    aria-label={`Add another ${itemName}`}
                    disabled={!available || disabled || !canIncrease}
                    onClick={onAdd}
                  >
                    +
                  </Button>
                </div>
              ) : (
                <span className="product-added">
                  <Icon name="check" size={14} />
                  Added to cart
                </span>
              )
            ) : (
              <Button
                variant="outline"
                className="product-add"
                aria-label={`${itemName} ${money(price)} · Add to cart`}
                disabled={!available || disabled}
                onClick={(event) => {
                  if (document.activeElement === event.currentTarget)
                    replacementFocus.current = true;
                  onAdd();
                }}
              >
                Add to cart
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
