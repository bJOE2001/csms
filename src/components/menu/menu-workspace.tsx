"use client";
import { coffeeBrand } from "@/lib/brand";
import { useState } from "react";
import {
  isAvailable,
  priceRange,
  productInventoryStatus,
} from "@/lib/menu/domain";
import { useCatalog } from "@/lib/menu/use-catalog";
import { optionUnavailableReason, productUnavailableReason } from "@/lib/menu/availability";
import { money } from "@/lib/sales/domain";
import { WorkspaceSkeleton } from "../ui/workspace-skeleton";
import { WorkspaceShell } from "../workspace-shell";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { Select } from "../ui/select";
import { ProductThumbnail } from "../pos/product-thumbnail";
import { ProductDialog } from "./product-dialog";
import { DeleteMenuRecord } from "../delete-menu-record";
import { RecipeDialog } from "../inventory/recipe-dialog";
import { RecipeStatus } from "./recipe-status";
import { accessFor, can } from "@/lib/auth/permissions";

export function MenuWorkspace() {
  const { data, error, refresh, isLoading } = useCatalog({ module: "menu" });
  const [categoryId, setCategoryId] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort] = useState("name");
  if (!data)
    return (
      <WorkspaceShell active="menu" shopName={coffeeBrand.name}>
        {error ? (
          <section>
            <h1>Menu Management</h1>
            <p role="alert" className="form-message error">
              {error}
            </p>
            <Button onClick={refresh}>Try again</Button>
            <a className="nav-link" href="/login">
              Sign in
            </a>
          </section>
        ) : (
          <WorkspaceSkeleton module="menu" track={false} />
        )}
      </WorkspaceShell>
    );

  const available = data.products.filter(isAvailable).length;
  const access = data.access ?? accessFor(data.founder ? "founder" : "staff");
  const canAdd = can(access, "menu", "create"), canEdit = can(access, "menu", "edit"), canDelete = can(access, "menu", "delete"), canRecipe = can(access, "inventory", "recipe");
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
    <WorkspaceShell active="menu" shopName={data.shop.name} access={access}>
      <div className="menu-management grid gap-6" aria-busy={isLoading || undefined}>
        <header className="flex flex-col items-start justify-between gap-4 min-[761px]:flex-row min-[761px]:items-center">
          <div>
            <h1 className="m-0">Menu Management</h1>
            <p className="hint mb-0 mt-2">
              Manage your products, sizes, pricing, recipes, and availability.
            </p>
          </div>
          {canAdd && <ProductDialog data={data} refresh={refresh} />}
        </header>
        {error && (
          <p role="alert" className="form-message error">
            {error}{" "}
            <Button variant="outline" onClick={refresh}>
              Refresh menu
            </Button>
          </p>
        )}
        {!canAdd && !canEdit && !canDelete && !canRecipe && (
          <p className="hint">
            You have view-only access to the menu.
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
            paginationResetKey={JSON.stringify([categoryId, availability, sort])}
            toolbarLeading={
              <div className="menu-products-heading">
                <h2>Products</h2>
                <p className="hint">
                  Keep your counter menu ready and connect recipes for automatic stock tracking.
                </p>
              </div>
            }
            actions={
              <div className="menu-filter-bar">
                <label className="field">
                  <span className="sr-only">Category</span>
                  <Select
                    value={categoryId}
                    aria-label="Category"
                    onValueChange={setCategoryId}
                    options={[
                      { value: "all", label: "All categories" },
                      { value: "none", label: "Uncategorized" },
                      ...data.categories.map((category) => ({
                        value: category.id,
                        label: category.name,
                      })),
                    ]}
                  />
                </label>
                <label className="field">
                  <span className="sr-only">Availability</span>
                  <Select
                    value={availability}
                    aria-label="Availability"
                    onValueChange={setAvailability}
                    options={[
                      { value: "all", label: "All availability" },
                      { value: "available", label: "Available" },
                      { value: "unavailable", label: "Unavailable" },
                    ]}
                  />
                </label>
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
              { key: "product", label: "Product", kind: "primary", sortable: true },
              { key: "category", label: "Category", sortable: true },
              { key: "sizes", label: "Size" },
              { key: "price", label: "Price", numeric: true, sortable: true },
              ...(data.founder ? [{ key: "recipe", label: "Recipe Status", kind: "status" as const }] : []),
              { key: "active", label: "Availability", kind: "status" },
              { key: "actions", label: "Actions", kind: "actions" },
            ]}
            rows={products.map((product) => {
              const range = priceRange(product);
              const invStatus = productInventoryStatus(product);
              const unavailableReason = productUnavailableReason(product);
              const missingCost = (product.sizes?.length ? product.sizes.map(size => size.id) : ["regular"])
                .some(key => product.inventory?.[key]?.state !== "active" || product.inventory[key].cost_cents == null);
              const categoryName =
                data.categories.find(
                  (category) => category.id === product.category_id,
                )?.name ?? "Uncategorized";
              return {
                id: product.id,
                search: `${product.name} ${data.founder ? invStatus : ""}`,
                sort: {
                  product: product.name,
                  category: categoryName,
                  price: range.min,
                },
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
                            {product.sizes?.length ? "Preparation cost unavailable for some sizes" : "Preparation cost unavailable"}
                          </small>
                        )}
                      </div>
                    </div>
                  ),
                  category: categoryName,
                  sizes: (
                    <span className="menu-size-list">
                      {product.sizes?.length
                        ? product.sizes.map((size) => {
                          const reason = !size.active ? "Size disabled by owner" : product.active ? optionUnavailableReason(product, size.id) : undefined;
                          return (
                            <span key={size.id}>
                              {size.label}
                              {size.is_default ? " · Default" : ""}
                              {reason ? ` · ${reason}` : ""}
                            </span>
                          );
                        })
                        : "Regular"}
                    </span>
                  ),
                  price: (
                    <strong className="menu-price">
                      {money(range.min)}
                      {range.max !== range.min ? ` – ${money(range.max)}` : ""}
                    </strong>
                  ),
                  ...(data.founder ? { recipe: <div className="menu-recipe-status"><RecipeStatus status={invStatus} /></div> } : {}),
                  active: (
                    <div className="menu-availability">
                      <span className={`menu-status ${isAvailable(product) ? "menu-status-available" : ""}`}>
                        {isAvailable(product) ? "Available" : "Unavailable"}
                      </span>
                      {unavailableReason && unavailableReason !== "Recipe missing" && unavailableReason !== "Recipe not activated" && <small className="menu-availability-reason">{unavailableReason}</small>}
                    </div>
                  ),
                  actions: canEdit || canDelete || canRecipe ? (
                    <div className="table-actions">
                      {canRecipe && <RecipeDialog product={product} refresh={refresh} />}
                      {canEdit && <ProductDialog
                        product={product}
                        data={data}
                        refresh={refresh}
                      />}
                      {canDelete && <DeleteMenuRecord
                        id={product.id}
                        name={product.name}
                        kind="product"
                        shopId={data.shop.id}
                        refresh={refresh}
                      />}
                    </div>
                  ) : (
                    "View only"
                  ),
                },
              };
            })}
          />
        </section>
      </div>
    </WorkspaceShell>
  );
}
