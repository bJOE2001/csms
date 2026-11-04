import { VisitSection } from "@/components/site/visit-section";
import { PublicLanding } from "@/components/site/public-landing";
import { PublicShell } from "@/components/site/public-shell";
import { FeaturedProducts } from "@/components/site/featured-products";
import { MenuGallery } from "@/components/site/menu-gallery";
import type { PublicMenu } from "@/lib/site/public-menu";
import { siteContent, type VisitDetails } from "@/lib/site/config";
import "@/app/landing.css";

export const fixturePublicMenu: PublicMenu = { status: "published", products: [
  { id: "00000000-0000-4000-8000-000000000001", name: "Café Latte", description: "Espresso with milk.", category: "Coffee", image: null, price: 12000, sizes: [{ label: "12 oz", price: 12000 }, { label: "16 oz", price: 14500 }] },
  { id: "00000000-0000-4000-8000-000000000002", name: "Americano", description: "Espresso and water.", category: "Coffee", image: null, price: 9500, sizes: [] },
  { id: "00000000-0000-4000-8000-000000000003", name: "Butter Croissant", description: "Flaky pastry.", category: "Food", image: null, price: 8500, sizes: [] },
  { id: "00000000-0000-4000-8000-000000000004", name: "Chocolate", description: "Cocoa and milk.", category: "Non-Coffee", image: null, price: 11000, sizes: [{ label: "16 oz", price: 11000 }] },
] };
const visit: VisitDetails = { address: "Purok 6, Ising, Carmen, Davao del Norte", hours: "5:00 PM–9:00 PM", directions: "https://www.google.com/maps/search/?api=1&query=LOGO%20Coffee%2C%20Purok%206%2C%20Ising%2C%20Carmen%2C%20Davao%20del%20Norte" };
export function LandingFixture() {
  const params = new URLSearchParams(location.search);
  const menu: PublicMenu = params.has("unpublished") ? { status: "unpublished", products: [] } : fixturePublicMenu;
  const full = params.has("catalog") || location.pathname === "/coffee-menu";
  return <PublicShell visit={visit}>{location.pathname === "/visit" ? <VisitSection visit={visit} standalone /> : full ? <section className="site-section site-full-menu-page"><header className="site-menu-heading"><p className="site-kicker">FIND YOUR NEXT FAVORITE</p><h1>Something for<br /><em>your kind of moment.</em></h1><p>Explore our current selections, sizes, and prices.</p></header><MenuGallery initialMenu={menu} /></section> : <PublicLanding visit={visit} menu={<FeaturedProducts menu={menu} />} />}{params.has("config") && <span className="sr-only">{siteContent.name}</span>}</PublicShell>;
}
