import type { Metadata } from "next";
import { siteOrigin, visitDetails } from "./config";
import { coffeeBrand } from "../brand";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const origin = siteOrigin();
  return {
    title: { absolute: title }, description, robots: { index: true, follow: true },
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: `${origin}${path}` } } : {}),
    openGraph: { title, description, type: "website", siteName: coffeeBrand.name, locale: "en_PH", ...(origin ? { url: `${origin}${path}` } : {}) },
    twitter: { card: "summary", title, description },
  };
}

export function coffeeShopSchema() {
  const origin = siteOrigin(), visit = visitDetails();
  return {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: coffeeBrand.name,
    address: visit.address,
    ...(origin ? { url: origin, hasMenu: `${origin}/menu` } : {}),
    ...(visit.phone ? { telephone: visit.phone } : {}), ...(visit.email ? { email: visit.email } : {}),
    ...(visit.directions ? { hasMap: visit.directions } : {}),
    // Operating days were not supplied; do not imply a daily schedule in structured data.
    sameAs: [visit.instagram, visit.facebook].filter(Boolean),
  };
}
