import { coffeeBrand } from "../brand";

/** Owner-confirmed address and hours. Contact channels stay unpublished until supplied. */
export type VisitDetails = { address?: string; hours?: string; email?: string; phone?: string; directions?: string; instagram?: string; facebook?: string; ordering?: string };
export const siteContent = {
  name: coffeeBrand.name,
  eyebrow: "YOUR NEXT COFFEE MOMENT",
  headline: ["Good coffee.", "Better moments."],
  description: "Find your next favorite cup at LOGO Coffee. Explore the menu and make your coffee moment worth sharing.",
  story: "Good coffee has a way of bringing people together. Every visit is another chance to slow down and enjoy the moment.",
  // Licensed illustrations, not photographs of LOGO Coffee products or premises.
  hero: { src: "/site/iced-coffee.webp", alt: "Milk swirling into iced coffee in a clear glass — illustrative photograph.", width: 1600, height: 1068 },
  storyImage: { src: "/site/coffee-moment.webp", alt: "Heart-shaped latte art in a glass cup, lit by the afternoon sun — illustrative photograph.", width: 1200, height: 1600 },
  photographyNote: "Illustrative coffee photography. LOGO Coffee photos coming soon.",
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
    directions: httpsUrl(process.env.SITE_DIRECTIONS_URL) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`LOGO Coffee, ${address}`)}`,
    instagram: httpsUrl(process.env.SITE_INSTAGRAM_URL), facebook: httpsUrl(process.env.SITE_FACEBOOK_URL), ordering: httpsUrl(process.env.SITE_ORDERING_URL),
  };
}

/** Set the verified public domain before publishing canonical URLs or the sitemap. */
export function siteOrigin() {
  const value = httpsUrl(process.env.SITE_URL);
  return value ? new URL(value).origin : undefined;
}
