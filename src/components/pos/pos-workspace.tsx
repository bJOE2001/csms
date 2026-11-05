"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { WorkspaceSkeleton } from "../ui/workspace-skeleton";
import { WorkspaceShell } from "../workspace-shell";
import { Icon } from "../ui/icon";
import { notify, isNotificationTarget } from "@/lib/notify";
import { ProductThumbnail } from "./product-thumbnail";
import { ProductCard } from "./product-card";
import { Button } from "../ui/button";
import { Input } from "../ui/primitives/input";
import { Card } from "../ui/card";
import {
  cents,
  money,
  paymentMethodLabel,
  checkoutSchema,
  type Checkout,
} from "@/lib/sales/domain";

import { defaultSizeId, isAvailable } from "@/lib/menu/domain";
import { useCatalog } from "@/lib/menu/use-catalog";
import {
  addLine,
  cartIssue,
  lineKey,
  reviewLine,
  type CartLine,
} from "@/lib/pos/cart";

const cartMediaQuery = "(max-width: 1279px)";
function subscribeCartLayout(notify: () => void) {
  const query = window.matchMedia(cartMediaQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const compactCartSnapshot = () => window.matchMedia(cartMediaQuery).matches;
const serverCartSnapshot = () => false;

export function PosWorkspace() {
  const compactCart = useSyncExternalStore(
    subscribeCartLayout,
    compactCartSnapshot,
    serverCartSnapshot,
  );
  const [cartOpen, setCartOpen] = useState(false);
  const cartHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!compactCart) setCartOpen(false);
  }, [compactCart]);
  const { data, error: loadError, refresh: load } = useCatalog();
  const [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [categoryId, setCategoryId] = useState("all"),
    [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({}),
    [cart, setCart] = useState<CartLine[]>([]),
    [method, setMethod] = useState<"cash" | "gcash">("cash"),
    [cash, setCash] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Checkout>();
  const key = data ? `simple-pos:${data.shop.id}:${data.user_id}` : "";
  useEffect(() => {
    if (!key) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved) setPending(checkoutSchema.parse(JSON.parse(saved)));
    } catch {
      setError(
        "The pending sale could not be read. Keep this browser's storage and contact support.",
      );
    }
  }, [key]);
  const lines = cart;
  const issues = lines.map((line) => cartIssue(line, data?.products ?? []));
  const blocked = issues.some(Boolean);
  const total = lines.reduce((n, p) => n + p.price_cents * p.quantity, 0);
  let change = 0;
  try {
    change = cash ? Math.max(0, cents(cash) - total) : 0;
  } catch {}
  function changeQuantity(key: string, delta: -1 | 1) {
    if (busy || pending) return;
    setCart((current) =>
      current
        .map((line) =>
          line.key === key && !(delta > 0 && cartIssue(line, data?.products ?? []))
            ? { ...line, quantity: Math.min(100, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }
  async function submit() {
    if (!data || busy) return;
    setError("");
    notify.dismiss("pos-checkout");
    setBusy(true);
    let processing = false;
    try {
      let sale = pending;
      if (!sale) {
        if (!lines.length) throw Error("Add a product first.");
        if (blocked)
          throw Error("Review changed or unavailable items in the cart first.");
        const tendered =
          method === "cash" ? (cash ? cents(cash) : total) : undefined;
        if (tendered !== undefined && tendered < total)
          throw Error("Cash received must cover the total.");
        sale = checkoutSchema.parse({
          id: crypto.randomUUID(),
          method,
          tendered_cents: tendered,
          items: lines.map((p) => ({
            product_id: p.product_id,
            ...(p.size_id
              ? { size_id: p.size_id, size_label: p.size_label }
              : {}),
            quantity: p.quantity,
            price_cents: p.price_cents,
          })),
        });
        localStorage.setItem(key, JSON.stringify(sale));
        setPending(sale);
      }
      processing = true;
      const response = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkout",
          shop_id: data.shop.id,
          data: sale,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 400 || response.status === 422) {
          localStorage.removeItem(key);
          setPending(undefined);
          await load();
        }
        throw Error(result.error);
      }
      localStorage.removeItem(key);
      setPending(undefined);
      setCart([]);
      setCash("");
      notify.success("Sale completed successfully", {
        id: "pos-checkout",
        description: `${money(result.data.total_cents)} · Receipt #${sale.id.slice(0, 8).toUpperCase()}`,
      });
    } catch (e) {
      const message = e instanceof Error
        ? e.message
        : "Connection interrupted. Retry the saved sale before starting another.";
      if (processing) notify.error("Checkout failed", { id: "pos-checkout", description: message });
      else setError(message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <WorkspaceShell active="pos" shopName="LOGO Coffee">
    {error || loadError ? <section className="workspace-load-error">
      <h1>POS unavailable</h1>
      <p role="alert" className="form-message error">{error || loadError}</p>
      <Button onClick={load}>Try again</Button>
      <a className="nav-link" href="/app/setup">Shop setup</a>
      <a className="nav-link" href="/sign-in">Sign in</a>
    </section> : <WorkspaceSkeleton module="pos" track={false} />}
  </WorkspaceShell>;

  const visibleProducts = data.products.filter(
    (product) =>
      product.name.toLowerCase().includes(query.toLowerCase()) &&
      (categoryId === "all" || (product.category_id ?? "none") === categoryId),
  );
  const itemCount = lines.reduce((sum, p) => sum + p.quantity, 0);
  const feedback = (
    <>
      {(error || loadError) && (
        <p role="alert" className="form-message error">
          {error || loadError}
        </p>
      )}
    </>
  );
  const cartContent = (
    <>
      <div className="cart-heading">
        {compactCart ? (
          <Dialog.Title ref={cartHeading} tabIndex={-1}>
            Cart
          </Dialog.Title>
        ) : (
          <h2 ref={cartHeading} tabIndex={-1}>Cart</h2>
        )}
        <span
          className="cart-count"
          aria-label={`${itemCount} items in cart`}
        >
          {itemCount}
        </span>
        {compactCart && (
          <Dialog.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="cart-close"
              aria-label="Close cart"
            >
              <Icon name="close" />
            </Button>
          </Dialog.Close>
        )}
      </div>
      {compactCart && cartOpen && feedback}
      {pending ? (
        <div className="cart-body">
          <p className="hint">
            Receipt {pending.id.slice(0, 8).toUpperCase()} is saved on this
            browser. Retry it to confirm the result before starting another
            sale.
          </p>
        </div>
      ) : (
        <>
          <div className="cart-body">
            {!lines.length && (
              <div className="cart-empty">
                <Icon name="bag" size={32} />
                <strong>Your cart is empty</strong>
                <p>Add a product to start a sale.</p>
              </div>
            )}
            {lines.map((p, index) => (
              <div className="order-line" key={p.key}>
                <ProductThumbnail name={p.name} imageUrl={p.image_url} />
                <div className="order-description">
                  <strong>{p.name}</strong>
                  <div className="order-meta">
                    {p.size_label && <small>Size: {p.size_label}</small>}
                    <small>{money(p.price_cents)} each</small>
                  </div>
                </div>
                <div className="order-line-footer">
                  <div className="order-controls">
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Decrease ${p.name}${p.size_label ? ` ${p.size_label}` : ""}`}
                      onClick={() => changeQuantity(p.key, -1)}
                    >
                      −
                    </Button>
                    <span>{p.quantity}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={`Increase ${p.name}${p.size_label ? ` ${p.size_label}` : ""}`}
                      disabled={p.quantity >= 100 || !!issues[index]}
                      onClick={() => changeQuantity(p.key, 1)}
                    >
                      +
                    </Button>
                  </div>
                  <strong className="order-line-total">
                    {money(p.quantity * p.price_cents)}
                  </strong>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="order-remove"
                    aria-label={`Remove ${p.name}${p.size_label ? ` ${p.size_label}` : ""} from cart`}
                    onClick={() =>
                      setCart((current) =>
                        current.filter((line) => line.key !== p.key),
                      )
                    }
                  >
                    <Icon name="delete" size={18} />
                  </Button>
                </div>
                {issues[index] && (
                  <div className="cart-item-issue" role="alert">
                    <p>{issues[index]}</p>
                    {reviewLine(p, data.products) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          const reviewed = reviewLine(p, data.products);
                          if (reviewed)
                            setCart((current) =>
                              current.map((line) =>
                                line.key === p.key ? reviewed : line,
                              ),
                            );
                        }}
                      >
                        Use{" "}
                        {reviewLine(p, data.products)?.size_label ??
                          "current item"}{" "}
                        · {money(reviewLine(p, data.products)!.price_cents)}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="cart-checkout">
            <p className="pos-total">
              <span>Total</span>
              <strong>{money(total)}</strong>
            </p>
            <fieldset disabled={busy}>
              <legend>Payment method</legend>
              <div className="payment-methods">
                <Button
                  variant={method === "cash" ? "default" : "outline"}
                  aria-pressed={method === "cash"}
                  onClick={() => setMethod("cash")}
                >
                  Cash
                </Button>
                <Button
                  variant={method === "gcash" ? "default" : "outline"}
                  aria-pressed={method === "gcash"}
                  onClick={() => setMethod("gcash")}
                >
                  {paymentMethodLabel("gcash")}
                </Button>
              </div>
              {method === "cash" ? (
                <>
                  <label className="field">
                    Cash received
                    <Input
                      value={cash}
                      onChange={(e) => setCash(e.target.value)}
                      inputMode="decimal"
                      placeholder="Leave blank for exact payment"
                    />
                  </label>
                  <p className="cart-change">Change {money(change)}</p>
                </>
              ) : (
                <p className="hint my-5">
                  Check that the wallet payment arrived before completing
                  the sale.
                </p>
              )}
            </fieldset>
          </div>
        </>
      )}
      <Button
        className="checkout-button"
        pending={busy}
        pendingLabel="Saving sale…"
        disabled={!pending && (!lines.length || blocked || !!loadError)}
        onClick={submit}
      >
        {pending ? "Retry saved sale" : "Place an order"}
      </Button>
    </>
  );
  return (
    <Dialog.Root open={compactCart && cartOpen} onOpenChange={setCartOpen}>
      <WorkspaceShell active="pos" shopName={data.shop.name}>
        <div className="pos-layout">
          <section className="pos-menu" aria-label="Product menu" tabIndex={0}>
            <div className="pos-toolbar">
              <label className="pos-search input-group">
                <Icon name="search" size={20} />
                <span className="sr-only">Search products</span>
                <Input
                  focusOwner="parent"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search your menu…"
                />
              </label>
              <Dialog.Trigger asChild>
                <Button className="cart-trigger" aria-label={`Open cart, ${itemCount} items`}>
                  <Icon name="bag" size={18} />
                  Cart
                  <span className="cart-trigger-count" aria-hidden="true">{itemCount}</span>
                  <span className="cart-trigger-total">{pending ? "Retry saved sale" : money(total)}</span>
                </Button>
              </Dialog.Trigger>
              <span className="sr-only" aria-live="polite" aria-atomic="true">
                {itemCount} items in cart
              </span>
            </div>
            <div className="pos-menu-content">
              {data.categories.length > 0 && (
                <div
                  className="menu-filters"
                  role="group"
                  aria-label="Filter products by category"
                >
                  <button
                    type="button"
                    aria-pressed={categoryId === "all"}
                    onClick={() => setCategoryId("all")}
                  >
                    All products
                  </button>
                  {data.categories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      aria-pressed={categoryId === category.id}
                      onClick={() => setCategoryId(category.id)}
                    >
                      {category.name}
                    </button>
                  ))}
                  {data.products.some((product) => !product.category_id) && (
                    <button
                      type="button"
                      aria-pressed={categoryId === "none"}
                      onClick={() => setCategoryId("none")}
                    >
                      Uncategorized
                    </button>
                  )}
                </div>
              )}
              <div className="menu-section-heading">
                <h1>Product menu</h1>
                <span>
                  {visibleProducts.length}{" "}
                  {visibleProducts.length === 1 ? "item" : "items"} ·{" "}
                  {data.products.filter(isAvailable).length} available
                </span>
              </div>
              {(!compactCart || !cartOpen) && feedback}
              <div className="pos-products">
                {visibleProducts.map((product) => {
                  const chosen = selectedSizes[product.id];
                  const sizeId = product.sizes?.some((size) => size.id === chosen)
                    ? chosen
                    : defaultSizeId(product);
                  const cartKey = lineKey(product.id, sizeId);
                  const cartLine = cart.find((line) => line.key === cartKey);
                  return (
                    <ProductCard
                      key={product.id}
                      product={product}
                      sizeId={sizeId}
                      onSizeChange={(id) =>
                        setSelectedSizes((current) => ({
                          ...current,
                          [product.id]: id,
                        }))
                      }
                      quantity={cartLine?.quantity ?? 0}
                      disabled={busy || !!pending}
                      onAdd={() => {
                        try {
                          const next = addLine(cart, product, sizeId);
                          setCart(next);
                          setError("");
                        } catch (error) {
                          notify.warning("Unable to add product", { description: (error as Error).message });
                        }
                      }}
                    />
                  );
                })}
              </div>
              {!data.products.length && (
                <p className="empty-state">
                  No products yet. An owner can add products in Menu Management.
                </p>
              )}
              {!!data.products.length && !visibleProducts.length && (
                <div className="empty-state">
                  <p>
                    {query
                      ? `No products match “${query}”.`
                      : "No products in this category."}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setCategoryId("all");
                    }}
                  >
                    {query ? "Clear search" : "Show all products"}
                  </Button>
                </div>
              )}
            </div>
          </section>
          {compactCart ? (
            <Dialog.Portal>
              <Dialog.Overlay className="pos-cart-overlay" />
              <Dialog.Content
                className="panel pos-cart pos-cart-drawer"
                id="current-order"
                aria-describedby={undefined}
                onPointerDownOutside={event => {
                  if (isNotificationTarget(event.target)) event.preventDefault();
                }}
                onOpenAutoFocus={(event) => {
                  event.preventDefault();
                  cartHeading.current?.focus();
                }}
              >
                {cartContent}
              </Dialog.Content>
            </Dialog.Portal>
          ) : (
            <Card className="pos-cart" id="current-order" tabIndex={-1}>
              {cartContent}
            </Card>
          )}
        </div>
      </WorkspaceShell>
    </Dialog.Root>
  );
}
