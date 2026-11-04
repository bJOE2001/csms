import { Suspense } from "react";
import Link from "next/link";
import { MenuGallery } from "@/components/site/menu-gallery";
import { readPublicMenu } from "@/lib/site/read-public-menu";
import { publicMetadata } from "@/lib/site/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata("Our Menu — LOGO Coffee", "Browse the LOGO Coffee menu: available drinks and food, real prices in PHP, and size options. Find your next favorite in Carmen, Davao del Norte.", "/coffee-menu");
async function Catalog() { return <MenuGallery initialMenu={await readPublicMenu()} />; }
export default function CustomerMenu() {
  return <section className="site-section site-full-menu-page"><header className="site-menu-heading"><p className="site-kicker">FIND YOUR NEXT FAVORITE</p><h1>Something for<br /><em>your kind of moment.</em></h1><p>Explore our current selections, sizes, and prices.<br />Choose your favorite, then <Link href="/visit">come see us</Link>.</p></header>
    <Suspense fallback={<div className="site-menu-loading" role="status"><span className="sr-only">Loading menu…</span>{[0, 1, 2].map(i => <span key={i} />)}</div>}><Catalog /></Suspense>
  </section>;
}
