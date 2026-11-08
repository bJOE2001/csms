import type { Metadata } from "next";
import { siteOrigin, visitDetails } from "./config";
import { coffeeBrand } from "../brand";

export function publicMetadata(title: string, description: string, path: string): Metadata {
  const origin = siteOrigin();
  return {
    title: { absolute: title }, description, robots: { index: true, follow: true },
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: `${origin}${path}` } } : {}),
    openGraph: { title, description, type: "website", siteName: coffeeBrand.name, locale: "en_PH", ...(origin ? { url: `${origin}${path}`, images: [{ url: `${origin}${coffeeBrand.logo.src}`, width: coffeeBrand.logo.width, height: coffeeBrand.logo.height, alt: coffeeBrand.name }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(origin ? { images: [`${origin}${coffeeBrand.logo.src}`] } : {}) },
  };
}

export function coffeeShopSchema() {
  const origin = siteOrigin(), visit = visitDetails();
  return {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop", name: coffeeBrand.name,
    address: visit.address,
    ...(origin ? { url: origin, image: `${origin}${coffeeBrand.logo.src}`, logo: `${origin}${coffeeBrand.logo.src}`, hasMenu: `${origin}/menu` } : {}),
    ...(visit.phone ? { telephone: visit.phone } : {}), ...(visit.email ? { email: visit.email } : {}),
    ...(visit.directions ? { hasMap: visit.directions } : {}),
    // Operating days were not supplied; do not imply a daily schedule in structured data.
    sameAs: [visit.instagram, visit.facebook].filter(Boolean),
  };
}
