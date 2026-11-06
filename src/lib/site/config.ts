import { coffeeBrand } from "../brand";

/** Owner-confirmed address and hours. Contact channels stay unpublished until supplied. */
export type VisitDetails = { address?: string; hours?: string; email?: string; phone?: string; directions?: string; instagram?: string; facebook?: string; ordering?: string };
export type SitePhoto = {
  src: string; alt: string; width: number; height: number; kind: "concept" | "approved";
  /** Percentage coordinates for the unchanged artwork, not an AI-generated wordmark. Omit for approved branded photos. */
  sticker?: { left: number; top: number; width: number };
};
export const siteContent = {
  name: "LOGO",
  eyebrow: "YOUR NEXT COFFEE MOMENT",
  headline: ["Good coffee.", "Better moments."],
  description: "Find your next favorite cup at LOGO. Explore the menu and make your coffee moment worth sharing.",
  story: "Good coffee has a way of bringing people together. At LOGO, every visit is a chance to slow down and enjoy the moment.",
  // Temporary generated concepts, not photographs of actual products, packaging or premises.
  hero: { src: "/site/takeaway-latte-concept.webp", alt: "Iced latte in a takeaway cup with the original LOGO sticker. Temporary packaging concept.", width: 1122, height: 1402, kind: "concept", sticker: { left: 49, top: 54, width: 30 } } satisfies SitePhoto,
  storyImage: { src: "/site/coffee-together-concept.webp", alt: "A shared coffee moment with takeaway cups and the original LOGO sticker. Temporary lifestyle concept.", width: 1402, height: 1122, kind: "concept", sticker: { left: 44.5, top: 65, width: 16 } } satisfies SitePhoto,
  photographyNote: "Concept imagery. Actual drinks, packaging and shop may differ.",
} as const;

export function httpsUrl(value?: string) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
export function visitDetails(): VisitDetails {
  const address = process.env.SITE_ADDRESS?.trim() || coffeeBrand.address;
  const hours = process.env.SITE_OPENING_HOURS?.trim() || "5:00 PM–9:00 PM";
  const email = process.env.SITE_CONTACT_EMAIL?.trim();
  const phone = process.env.SITE_CONTACT_PHONE?.trim();
  return {
    address, hours,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined,
    phone: phone && /^\+?[\d\s()-]{7,24}$/.test(phone) ? phone : undefined,
    directions: httpsUrl(process.env.SITE_DIRECTIONS_URL) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`LOGO, ${address}`)}`,
    instagram: httpsUrl(process.env.SITE_INSTAGRAM_URL), facebook: httpsUrl(process.env.SITE_FACEBOOK_URL), ordering: httpsUrl(process.env.SITE_ORDERING_URL),
  };
}

/** Set the verified public domain before publishing canonical URLs or the sitemap. */
export function siteOrigin() {
  const value = httpsUrl(process.env.SITE_URL);
  return value ? new URL(value).origin : undefined;
}
