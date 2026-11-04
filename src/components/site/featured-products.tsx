import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { featuredProducts, type PublicMenu } from "@/lib/site/public-menu";
import { PublicProductCard } from "./public-product-card";

export function FeaturedProducts({ menu, ids = [] }: { menu: PublicMenu; ids?: string[] }) {
  const products = featuredProducts(menu.products, ids);
  return <section className="site-featured site-section" aria-labelledby="featured-title">
    <div className="site-section-heading"><div><p className="site-kicker">A LITTLE SOMETHING TO LOOK FORWARD TO</p><h2 id="featured-title">Made for your<br /><em>coffee moments.</em></h2></div><div><p>Find something worth coming back for.</p><Link prefetch={false} className="site-text-link" href="/coffee-menu">Explore Full Menu<ArrowUpRight size={18} aria-hidden="true" /></Link></div></div>
    {products.length ? <div className="site-product-grid">{products.map(product => <PublicProductCard key={`${product.id}:${product.image}`} product={product} featured />)}</div> : <div className="site-menu-empty"><h3>{menu.status === "unavailable" ? "Our menu is taking a short break." : "Our online menu is being prepared."}</h3><p>{menu.status === "unavailable" ? "Try the full menu again in a moment, or ask about our selections when you visit." : "You can still find your coffee moment in person. Visit us to see our current selections."}</p><Link className="site-text-link" href="/visit">Plan a visit<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
  </section>;
}
