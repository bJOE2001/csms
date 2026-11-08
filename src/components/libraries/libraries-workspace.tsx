"use client";
import { coffeeBrand } from "@/lib/brand";

import { useCatalog } from "@/lib/menu/use-catalog";
import { WorkspaceSkeleton } from "../ui/workspace-skeleton";
import { WorkspaceShell } from "../workspace-shell";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { DeleteMenuRecord } from "../delete-menu-record";
import { CategoryDialog } from "./category-dialog";

export function LibrariesWorkspace() {
  const { data, error, refresh, isLoading } = useCatalog();
  if (!data) return <WorkspaceShell active="libraries" shopName={coffeeBrand.name}>
    {error ? <section>
      <h1>Libraries</h1>
      <p role="alert" className="form-message error">{error}</p>
      <Button onClick={refresh}>Try again</Button>
      <a className="nav-link" href="/sign-in">Sign in</a>
    </section> : <WorkspaceSkeleton module="libraries" track={false} />}
  </WorkspaceShell>;

  return (
    <WorkspaceShell active="libraries" shopName={data.shop.name}>
      <div className="libraries-workspace grid gap-6" aria-busy={isLoading || undefined}>
        <header>
          <h1 className="m-0">Libraries</h1>
          <p className="hint mb-0 mt-2">Manage reusable reference data across your system.</p>
        </header>
        {error && (
          <p role="alert" className="form-message error">
            {error} <Button variant="outline" onClick={refresh}>Refresh categories</Button>
          </p>
        )}
        {!data.founder && <p className="hint m-0">You can view categories. An owner manages category records.</p>}
        <section className="libraries-categories panel" aria-labelledby="product-categories-heading">
          <DataTable
            caption="Product categories"
            toolbarLeading={
              <div className="libraries-section-heading">
                <h2 id="product-categories-heading">Product Categories</h2>
                <p className="hint">Organize products into reusable menu categories.</p>
              </div>
            }
            actions={data.founder ? <CategoryDialog shopId={data.shop.id} refresh={refresh} /> : undefined}
            searchPlaceholder="Search category name"
            emptyMessage="No categories yet. Add your first category to organize your menu."
            columns={[
              { key: "name", label: "Category Name", kind: "primary" },
              { key: "products", label: "Number of Products", numeric: true },
              { key: "actions", label: "Actions", kind: "actions" },
            ]}
            rows={data.categories.map(category => {
              const count = data.products.filter(product => product.category_id === category.id).length;
              return {
                id: category.id,
                search: category.name,
                cells: {
                  name: <strong>{category.name}</strong>,
                  products: count,
                  actions: data.founder ? (
                    <div className="table-actions">
                      <CategoryDialog category={category} shopId={data.shop.id} refresh={refresh} />
                      <DeleteMenuRecord id={category.id} name={category.name} kind="category" shopId={data.shop.id} refresh={refresh} used={count > 0} />
                    </div>
                  ) : "View only",
                },
              };
            })}
          />
        </section>
      </div>
    </WorkspaceShell>
  );
}
