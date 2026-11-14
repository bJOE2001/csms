import { coffeeBrand } from "@/lib/brand";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { featuredProducts, type PublicMenu } from "@/lib/site/public-menu";
import { PublicProductCard } from "./public-product-card";

export function FeaturedProducts({ menu, ids = [] }: { menu: PublicMenu; ids?: string[] }) {
  const products = featuredProducts(menu.products, ids, menu.featured_ids);
  return <section className="site-featured site-section" aria-labelledby="featured-title">
    <div className="site-section-heading" data-reveal="" suppressHydrationWarning><div><p className="site-kicker">OUR FAVORITES</p><h2 id="featured-title">Find your<br /><em>next favorite.</em></h2></div><Link prefetch={false} className="site-text-link" href="/menu">View Full Menu<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
    {products.length ? <div className="site-product-grid">{products.map((product, index) => <PublicProductCard key={`${product.id}:${product.image}`} product={product} featured staggerIndex={index} />)}</div> : <div className="site-menu-empty"><h3>{menu.status === "unavailable" ? "Our menu is taking a short break." : "Your next favorite is waiting in store."}</h3><p>{menu.status === "unavailable" ? "Try the full menu again in a moment, or ask about our selections when you visit." : `Our current selections aren't published online yet. Come by ${coffeeBrand.name} to explore the drinks and prices in person.`}</p><Link className="site-text-link" href="/visit">Plan a visit<ArrowUpRight size={18} aria-hidden="true" /></Link></div>}
  </section>;
}
