import type { Metadata } from "next";
import { siteOrigin, visitDetails } from "./config";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const origin = siteOrigin();
  return {
    title, description, robots: { index: true, follow: true },
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: `${origin}${path}` } } : {}),
    openGraph: { title, description, type: "website", siteName: "LOGO Coffee", locale: "en_PH", ...(origin ? { url: `${origin}${path}`, images: [{ url: `${origin}/site/iced-coffee.webp`, width: 1600, height: 1068, alt: "Illustrative iced coffee photograph. Discover LOGO Coffee." }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(origin ? { images: [`${origin}/site/iced-coffee.webp`] } : {}) },
  };
}

export function coffeeShopSchema() {
  const origin = siteOrigin(), visit = visitDetails();
  return {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: "LOGO Coffee",
    address: visit.address,
    ...(origin ? { url: origin, image: `${origin}/images/Logov1.png`, hasMenu: `${origin}/coffee-menu` } : {}),
    ...(visit.phone ? { telephone: visit.phone } : {}), ...(visit.email ? { email: visit.email } : {}),
    ...(visit.directions ? { hasMap: visit.directions } : {}),
    // Operating days were not supplied; do not imply a daily schedule in structured data.
    sameAs: [visit.instagram, visit.facebook].filter(Boolean),
  };
}
