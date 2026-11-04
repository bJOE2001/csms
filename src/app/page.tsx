import "./landing.css";
import { PublicShell } from "@/components/site/public-shell";
import { Suspense } from "react";
import { PublicLanding } from "@/components/site/public-landing";
import { FeaturedProducts } from "@/components/site/featured-products";
import { readPublicMenu } from "@/lib/site/read-public-menu";
import { visitDetails } from "@/lib/site/config";
import { coffeeShopSchema, publicMetadata } from "@/lib/site/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("LOGO Coffee — Good Coffee. Better Moments.", `Discover LOGO Coffee at ${visitDetails().address}. Explore our coffee menu and plan your next coffee moment. Hours: ${visitDetails().hours}.`, "/");
async function MenuPreview() { return <FeaturedProducts menu={await readPublicMenu()} ids={process.env.SITE_FEATURED_PRODUCT_IDS?.split(",").map(id => id.trim())} />; }
export default function Home() {
  return <PublicShell visit={visitDetails()}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(coffeeShopSchema()).replace(/</g, "\\u003c") }} />
    <PublicLanding visit={visitDetails()} menu={<Suspense fallback={<div className="site-section site-menu-loading" role="status"><span className="sr-only">Loading menu…</span>{[0, 1, 2].map(i => <span key={i} />)}</div>}><MenuPreview /></Suspense>} />
  </PublicShell>;
}
