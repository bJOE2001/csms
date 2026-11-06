import type { Metadata } from "next";
import { siteOrigin, visitDetails } from "./config";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const origin = siteOrigin();
  return {
    title, description, robots: { index: true, follow: true },
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: `${origin}${path}` } } : {}),
    openGraph: { title, description, type: "website", siteName: "LOGO", locale: "en_PH", ...(origin ? { url: `${origin}${path}`, images: [{ url: `${origin}/images/Logov1.png`, width: 1774, height: 887, alt: "LOGO — Good coffee. Better moments." }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(origin ? { images: [`${origin}/images/Logov1.png`] } : {}) },
  };
}

export function coffeeShopSchema() {
  const origin = siteOrigin(), visit = visitDetails();
  return {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: "LOGO",
    address: visit.address,
    ...(origin ? { url: origin, image: `${origin}/images/Logov1.png`, hasMenu: `${origin}/menu` } : {}),
    ...(visit.phone ? { telephone: visit.phone } : {}), ...(visit.email ? { email: visit.email } : {}),
    ...(visit.directions ? { hasMap: visit.directions } : {}),
    // Operating days were not supplied; do not imply a daily schedule in structured data.
    sameAs: [visit.instagram, visit.facebook].filter(Boolean),
  };
}
