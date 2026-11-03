"use client";
import { useEffect, useState } from "react";
import { WorkspaceShell } from "../workspace-shell";
import { Icon } from "../ui/icon";
import { ProductThumbnail } from "./product-thumbnail";
import { ProductCard } from "./product-card";
import { Button } from "../ui/button";
import { Input } from "../ui/primitives/input";
import { Card } from "../ui/card";
import {
  cents,
  money,
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

export function PosWorkspace() {
  const { data, error: loadError, refresh: load } = useCatalog();
  const [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [categoryId, setCategoryId] = useState("all"),
    [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({}),
    [cart, setCart] = useState<CartLine[]>([]),
    [method, setMethod] = useState<"cash" | "gcash">("cash"),
    [cash, setCash] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Checkout>(),
    [message, setMessage] = useState("");
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
  async function submit() {
    if (!data || busy) return;
    setError("");
    setMessage("");
    setBusy(true);
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
      setMessage(
        `Sale complete · ${money(result.data.total_cents)} · Receipt ${sale.id.slice(0, 8).toUpperCase()}`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection interrupted. Retry the saved sale before starting another.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="workspace-content">
        <h1>Open POS</h1>
        {error || loadError ? (
          <>
            <p role="alert" className="form-message error">
              {error || loadError}
            </p>
            <Button onClick={load}>Try again</Button>
            <a className="nav-link" href="/app/setup">
              Shop setup
            </a>
            <a className="nav-link" href="/sign-in">
              Sign in
            </a>
          </>
        ) : (
          <p role="status">Loading your products…</p>
        )}
      </main>
    );

  const visibleProducts = data.products.filter(
    (product) =>
      product.name.toLowerCase().includes(query.toLowerCase()) &&
      (categoryId === "all" || (product.category_id ?? "none") === categoryId),
  );
  const itemCount = lines.reduce((sum, p) => sum + p.quantity, 0);
  return (
    <WorkspaceShell active="pos" shopName={data.shop.name}>
      <div className="pos-layout">
        <section className="pos-menu" aria-label="Product menu" tabIndex={0}>
          <div className="pos-toolbar">
            <label className="pos-search">
              <Icon name="search" size={20} />
              <span className="sr-only">Search products</span>
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your menu…"
              />
            </label>
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
            {(error || loadError) && (
              <p role="alert" className="form-message error">
                {error || loadError}
              </p>
            )}
            {message && (
              <p role="status" className="form-message success">
                {message}
              </p>
            )}
            {lines.length > 0 && !pending && (
              <a className="button mobile-order-link" href="#current-order">
                <Icon name="bag" size={18} />
                View order · {money(total)}
              </a>
            )}
            <div className="pos-products">
              {visibleProducts.map((product) => {
                const chosen = selectedSizes[product.id];
                const sizeId = product.sizes?.some((size) => size.id === chosen)
                  ? chosen
                  : defaultSizeId(product);
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
                    quantity={
                      cart.find(
                        (line) => line.key === lineKey(product.id, sizeId),
                      )?.quantity ?? 0
                    }
                    disabled={busy || !!pending}
                    onAdd={() => {
                      try {
                        const next = addLine(cart, product, sizeId);
                        setCart(next);
                        setError("");
                      } catch (error) {
                        setError((error as Error).message);
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
        <Card className="pos-cart" id="current-order" tabIndex={-1}>
          <div className="cart-heading">
            <h2>Cart</h2>
            <span
              className="cart-count"
              aria-label={`${itemCount} items in order`}
            >
              {itemCount}
            </span>
          </div>
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
                      {p.size_label && <small>Size: {p.size_label}</small>}
                      <small>{money(p.price_cents)} each</small>
                    </div>
                    <div className="order-controls">
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Decrease ${p.name}${p.size_label ? ` ${p.size_label}` : ""}`}
                        onClick={() =>
                          setCart((current) =>
                            current
                              .map((line) =>
                                line.key === p.key
                                  ? { ...line, quantity: line.quantity - 1 }
                                  : line,
                              )
                              .filter((line) => line.quantity > 0),
                          )
                        }
                      >
                        −
                      </Button>
                      <span>{p.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Increase ${p.name}${p.size_label ? ` ${p.size_label}` : ""}`}
                        disabled={p.quantity >= 100 || !!issues[index]}
                        onClick={() =>
                          setCart((current) =>
                            current.map((line) =>
                              line.key === p.key
                                ? { ...line, quantity: line.quantity + 1 }
                                : line,
                            ),
                          )
                        }
                      >
                        +
                      </Button>
                    </div>
                    <strong className="order-line-total">
                      {money(p.quantity * p.price_cents)}
                    </strong>
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
                        <Button
                          variant="ghost"
                          aria-label={`Remove ${p.name}${p.size_label ? ` ${p.size_label}` : ""}`}
                          onClick={() =>
                            setCart((current) =>
                              current.filter((line) => line.key !== p.key),
                            )
                          }
                        >
                          Remove item
                        </Button>
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
                      GCash
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
            {pending ? "Retry saved sale" : "Complete sale"}
            <Icon name="arrow" size={18} />
          </Button>
          <p className="cart-footnote">All amounts in PHP</p>
        </Card>
      </div>
    </WorkspaceShell>
  );
}
