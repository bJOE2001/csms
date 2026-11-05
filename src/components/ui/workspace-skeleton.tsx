"use client";

import type { WorkspaceModule } from "@/lib/workspace";
import { useLoadingSignal } from "./global-loading-bar";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`content-skeleton ${className}`} aria-hidden="true" />;
}

export function WorkspaceSkeleton({ module, track = true }: { module: WorkspaceModule; track?: boolean }) {
  useLoadingSignal(track);
  const pos = module === "pos";
  return <div className={`workspace-skeleton ${pos ? "pos-skeleton" : "management-skeleton"} ${module === "dashboard" ? "dashboard-skeleton" : ""}`} data-workspace-loading aria-busy="true">
    <span className="sr-only">Loading {module === "pos" ? "products" : module}…</span>
    {pos ? <>
      <section className="pos-skeleton-menu pos-menu" aria-label="Product menu loading">
        <div className="pos-skeleton-toolbar"><Skeleton className="skeleton-search" /><Skeleton className="skeleton-cart-trigger" /></div>
        <div className="pos-menu-content">
          <Skeleton className="skeleton-heading" />
          <div className="pos-products">
            {Array.from({ length: 6 }, (_, i) => <div className="product-skeleton" key={i}>
              <Skeleton className="skeleton-thumbnail" />
              <div><Skeleton className="skeleton-title" /><Skeleton className="skeleton-detail" /></div>
              <Skeleton className="skeleton-action" />
            </div>)}
          </div>
        </div>
      </section>
      <aside className="pos-skeleton-cart" aria-label="Cart loading"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-checkout" /></aside>
    </> : <>
      <Skeleton className="skeleton-heading" />
      <Skeleton className="skeleton-description" />
      {module !== "libraries" && <div className="skeleton-metrics" data-columns={module === "dashboard" ? 3 : module === "sales" ? 5 : 4}>
        {Array.from({ length: module === "dashboard" ? 3 : module === "sales" ? 5 : 4 }, (_, i) => <Skeleton key={i} className="skeleton-metric" />)}
      </div>}
      {module === "dashboard" && <>
        <Skeleton className="skeleton-strip" />
        <div className="dashboard-main-analytics"><Skeleton className="skeleton-chart" /><Skeleton className="skeleton-chart" /></div>
      </>}
      {module !== "dashboard" && <div className="skeleton-table">
        <Skeleton className="skeleton-search" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton className="skeleton-row" key={i} />)}
      </div>}
    </>}
  </div>;
}
