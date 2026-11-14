"use client";
import { coffeeBrand } from "@/lib/brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { publicMenuSchema, type PublicMenu } from "@/lib/site/public-menu";
import { PublicProductCard } from "./public-product-card";

export function MenuGallery({ initialMenu }: { initialMenu: PublicMenu }) {
  const [menu, setMenu] = useState(initialMenu), [category, setCategory] = useState<string | null>(null), [query, setQuery] = useState(""), [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller; setPending(true);
    try {
      const response = await fetch("/api/public-menu", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Menu unavailable");
      const next = publicMenuSchema.parse(await response.json());
      if (!controller.signal.aborted) setMenu(next);
    } catch {
      if (!controller.signal.aborted) setMenu(current => ({ ...current, status: "unavailable" }));
    } finally { if (request.current === controller) setPending(false); }
  }, []);
  useEffect(() => { setMenu(initialMenu); }, [initialMenu]);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => { request.current?.abort(); window.removeEventListener("focus", visible); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const categories = [...new Set(menu.products.map(product => product.category))];
  const active = category && categories.includes(category) ? category : null;
  const normalizedQuery = query.trim().toLowerCase();
  const products = menu.products.filter(
    product =>
      (!active || product.category === active) &&
      (!normalizedQuery ||
        product.name.toLowerCase().includes(normalizedQuery) ||
        product.description.toLowerCase().includes(normalizedQuery)),
  );
  return <div className="site-menu-content" aria-busy={pending || undefined}>
    {menu.products.length > 0 && <h2 className="sr-only">Menu selections</h2>}
    {menu.products.length > 0 && <div className="site-menu-toolbar">
      {categories.length > 1 && <div className="site-category-filters" role="group" aria-label="Browse menu by category"><button type="button" aria-pressed={!active} onClick={() => setCategory(null)}>All selections</button>{categories.map(value => <button type="button" key={value} aria-pressed={active === value} onClick={() => setCategory(value)}>{value}</button>)}</div>}
      <label className="site-menu-search">
        <span className="sr-only">Search menu</span>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search menu…"
          aria-label="Search menu"
        />
      </label>
      <p className="site-menu-count" role="status">{products.length} {products.length === 1 ? "selection" : "selections"}{active ? ` · ${active}` : ""}{normalizedQuery ? ` · “${query.trim()}”` : ""}{pending ? " · Refreshing availability…" : ""}</p>
    </div>}
    {menu.status === "unavailable" && menu.products.length > 0 && <p className="site-menu-notice" role="status">We couldn&apos;t refresh availability. Showing the last loaded menu. <button onClick={() => void refresh()} disabled={pending}>Try again</button></p>}
    {products.length ? <div className="site-product-grid">{products.map((product, index) => <PublicProductCard key={`${active ?? "all"}:${product.id}:${product.image}`} product={product} staggerIndex={index} />)}</div> : menu.products.length > 0 ? <div className="site-menu-empty">
      <h2>No selections match your search.</h2>
      <p>Try another keyword or browse all menu selections.</p>
      <button type="button" className="site-button site-button-dark" onClick={() => { setQuery(""); setCategory(null); }}>Clear search</button>
    </div> : <div className="site-menu-empty">
      <h2>{menu.status === "unavailable" ? "Our online menu is taking a short break." : "Our online menu is being prepared."}</h2>
      <p>{menu.status === "unavailable" ? "Please try again, or ask about our current selections when you visit." : `Visit ${coffeeBrand.name} to see our current selections. We look forward to your next coffee moment.`}</p>
      {menu.status === "unavailable" && <button className="site-button site-button-dark" onClick={() => void refresh()} disabled={pending}>{pending ? "Refreshing menu…" : "Try again"}</button>}
    </div>}
  </div>;
}
