import { cookies } from "next/headers";
import { coffeeBrand } from "@/lib/brand";
import "./landing.css";
import { PublicShell } from "@/components/site/public-shell";
import { Suspense } from "react";
import { PublicLanding } from "@/components/site/public-landing";
import { FeaturedProducts } from "@/components/site/featured-products";
import { readPublicMenu } from "@/lib/site/read-public-menu";
import { topSellingProductIds, type SaleRankRecord } from "@/lib/site/public-menu";
import { createClient } from "@/lib/supabase/server";
import { visitDetails } from "@/lib/site/config";
import { coffeeShopSchema, publicMetadata } from "@/lib/site/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata(coffeeBrand.name, `Discover ${coffeeBrand.name} at ${visitDetails().address}. Explore our coffee menu and plan your next coffee moment. Hours: ${visitDetails().hours}.`, "/");
async function MenuPreview() {
  let menu = await readPublicMenu();
  if (!menu.featured_ids?.length && menu.products.length > 0) {
    try {
      const cookieStore = await cookies();
      const hasSession = cookieStore.getAll().some(cookie => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
      if (hasSession) {
        const db = await createClient();
        const { data: sales } = await db
          .from("pos_sales")
          .select("status,items")
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(500);
        if (sales?.length) {
          const topIds = topSellingProductIds(
            menu.products,
            sales.map(sale => ({
              status: sale.status,
              items: Array.isArray(sale.items) ? (sale.items as SaleRankRecord["items"]) : [],
            })),
          );
          if (topIds.length) menu = { ...menu, featured_ids: topIds };
        }
      }
    } catch {
      /* Keep public storefront available if authenticated sales lookup cannot run. */
    }
  }
  return <FeaturedProducts menu={menu} ids={process.env.SITE_FEATURED_PRODUCT_IDS?.split(",").map(id => id.trim())} />;
}
export default function Home() {
  return <PublicShell visit={visitDetails()}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(coffeeShopSchema()).replace(/</g, "\\u003c") }} />
    <PublicLanding visit={visitDetails()} menu={<Suspense fallback={<div className="site-section site-menu-loading" role="status"><span className="sr-only">Loading menu…</span>{[0, 1, 2, 3].map(i => <span key={i} />)}</div>}><MenuPreview /></Suspense>} />
  </PublicShell>;
}
