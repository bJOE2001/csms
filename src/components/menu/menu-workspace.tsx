"use client";
import { useState } from "react";
import { isAvailable, priceRange } from "@/lib/menu/domain";
import { useCatalog } from "@/lib/menu/use-catalog";
import { money } from "@/lib/sales/domain";
import { WorkspaceShell } from "../workspace-shell";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { ProductThumbnail } from "../pos/product-thumbnail";
import { ProductDialog } from "./product-dialog";
import { CategoryDialog, DeleteMenuRecord } from "./category-dialog";

export function MenuWorkspace() {
  const { data, error, refresh } = useCatalog();
  const [categoryId, setCategoryId] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort] = useState("name");
  if (!data)
    return (
      <main className="workspace-content">
        <h1>Menu Management</h1>
        {error ? (
          <>
            <p role="alert" className="form-message error">
              {error}
            </p>
            <Button onClick={refresh}>Try again</Button>
            <a className="nav-link" href="/sign-in">
              Sign in
            </a>
          </>
        ) : (
          <p role="status">Loading your menu…</p>
        )}
      </main>
    );
  const available = data.products.filter(isAvailable).length;
  const products = data.products
    .filter(
      (product) =>
        (categoryId === "all" ||
          (product.category_id ?? "none") === categoryId) &&
        (availability === "all" ||
          isAvailable(product) === (availability === "available")),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (priceRange(a).min - priceRange(b).min) *
            (sort === "price_desc" ? -1 : 1) || a.name.localeCompare(b.name),
    );
  return (
    <WorkspaceShell active="menu" shopName={data.shop.name}>
      <div className="menu-management grid gap-6">
        <header className="flex flex-col items-start justify-between gap-4 min-[761px]:flex-row min-[761px]:items-center">
          <div>
            <h1 className="m-0">Menu Management</h1>
            <p className="hint mb-0 mt-2">
              Manage your products, categories, sizes, pricing, and
              availability.
            </p>
          </div>
          {data.founder && <ProductDialog data={data} refresh={refresh} />}
        </header>
        {error && (
          <p role="alert" className="form-message error">
            {error}{" "}
            <Button variant="outline" onClick={refresh}>
              Refresh menu
            </Button>
          </p>
        )}
        {!data.founder && (
          <p className="hint">
            You can view the menu. An owner manages products and categories.
          </p>
        )}
        <dl className="menu-overview">
          {[
            ["Total Products", data.products.length],
            ["Available Products", available],
            ["Unavailable Products", data.products.length - available],
            ["Total Categories", data.categories.length],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <section className="menu-products panel" aria-label="Manage products">
          <DataTable
            toolbarLeading={
              <div className="menu-products-heading">
                <h2>Products</h2>
                <p className="hint">
                  Keep your counter menu ready for the next order.
                </p>
              </div>
            }
            actions={
              <div className="menu-filter-bar">
                <label className="field">
                  <span className="sr-only">Category</span>
                  <select
                    value={categoryId}
                    aria-label="Category"
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="all">All categories</option>
                    <option value="none">Uncategorized</option>
                    {data.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="sr-only">Availability</span>
                  <select
                    value={availability}
                    aria-label="Availability"
                    onChange={(event) => setAvailability(event.target.value)}
                  >
                    <option value="all">All availability</option>
                    <option value="available">Available</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </label>
                {/* <label className="field">
              Sort products
              <select
                value={sort}
                aria-label="Sort products"
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="name">Name A–Z</option>
                <option value="price">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label> */}
                {(categoryId !== "all" || availability !== "all") && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCategoryId("all");
                      setAvailability("all");
                    }}
                  >
                    Reset filters
                  </Button>
                )}
              </div>
            }
            caption="Menu products"
            searchPlaceholder="Search product name"
            emptyMessage={
              data.products.length
                ? "No products match these filters."
                : "No products yet. Add your first product to start selling."
            }
            columns={[
              { key: "product", label: "Product" },
              { key: "category", label: "Category" },
              { key: "sizes", label: "Size" },
              { key: "price", label: "Price" },
              { key: "active", label: "Availability" },
              { key: "actions", label: "Actions" },
            ]}
            rows={products.map((product) => {
              const range = priceRange(product);
              const missingCost = product.sizes?.length
                ? product.sizes.some((size) => size.cost_cents == null)
                : product.cost_cents == null;
              return {
                id: product.id,
                search: product.name,
                cells: {
                  product: (
                    <div className="menu-product-identity">
                      <ProductThumbnail
                        name={product.name}
                        imageUrl={product.image_url}
                      />
                      <div>
                        <strong>{product.name}</strong>
                        {product.description && (
                          <small>{product.description}</small>
                        )}
                        {data.founder && missingCost && (
                          <small className="menu-cost-missing">
                            Cost not recorded
                          </small>
                        )}
                      </div>
                    </div>
                  ),
                  category:
                    data.categories.find(
                      (category) => category.id === product.category_id,
                    )?.name ?? "Uncategorized",
                  sizes: (
                    <span className="menu-size-list">
                      {product.sizes?.length
                        ? product.sizes.map((size) => (
                            <span key={size.id}>
                              {size.label}
                              {size.is_default ? " · Default" : ""}
                              {!size.active ? " · Unavailable" : ""}
                            </span>
                          ))
                        : "Regular"}
                    </span>
                  ),
                  price: (
                    <strong className="menu-price">
                      {money(range.min)}
                      {range.max !== range.min ? ` – ${money(range.max)}` : ""}
                    </strong>
                  ),
                  active: (
                    <span
                      className={`menu-status ${isAvailable(product) ? "menu-status-available" : ""}`}
                    >
                      {isAvailable(product) ? "Available" : "Unavailable"}
                    </span>
                  ),
                  actions: data.founder ? (
                    <div className="menu-row-actions">
                      <ProductDialog
                        product={product}
                        data={data}
                        refresh={refresh}
                      />
                      <DeleteMenuRecord
                        id={product.id}
                        name={product.name}
                        kind="product"
                        shopId={data.shop.id}
                        refresh={refresh}
                      />
                    </div>
                  ) : (
                    "View only"
                  ),
                },
              };
            })}
          />
        </section>
        <section
          className="menu-categories panel"
          aria-labelledby="categories-heading"
        >
          <div className="menu-list-heading">
            <div>
              <h2 id="categories-heading">Categories</h2>
              <p className="hint">
                Organize products without changing past transactions.
              </p>
            </div>
            {data.founder && (
              <CategoryDialog shopId={data.shop.id} refresh={refresh} />
            )}
          </div>
          {!data.categories.length && (
            <p className="hint">
              No categories yet. Products can be sold without a category.
            </p>
          )}
          <ul>
            {data.categories.map((category) => {
              const count = data.products.filter(
                (product) => product.category_id === category.id,
              ).length;
              return (
                <li key={category.id}>
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {count} {count === 1 ? "product" : "products"}
                    </span>
                  </div>
                  {data.founder && (
                    <div className="menu-row-actions">
                      <CategoryDialog
                        category={category}
                        shopId={data.shop.id}
                        refresh={refresh}
                      />
                      <DeleteMenuRecord
                        id={category.id}
                        name={category.name}
                        kind="category"
                        shopId={data.shop.id}
                        refresh={refresh}
                        used={count > 0}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </WorkspaceShell>
  );
}
