import { coffeeBrand } from "@/lib/brand";
import { Suspense } from "react";
import { MenuGallery } from "@/components/site/menu-gallery";
import { PublicMenuHeading } from "@/components/site/public-menu-heading";
import { readPublicMenu } from "@/lib/site/read-public-menu";
import { publicMetadata } from "@/lib/site/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("Menu", `Browse the ${coffeeBrand.name} menu: available drinks and food, real prices in PHP, and size options. Find your next favorite in Carmen, Davao del Norte.`, "/menu");
async function Catalog() { return <MenuGallery initialMenu={await readPublicMenu()} />; }
export default function CustomerMenu() {
  return <section className="site-section site-full-menu-page"><PublicMenuHeading />
    <Suspense fallback={<div className="site-menu-loading" role="status"><span className="sr-only">Loading menu…</span>{[0, 1, 2].map(i => <span key={i} />)}</div>}><Catalog /></Suspense>
  </section>;
}
