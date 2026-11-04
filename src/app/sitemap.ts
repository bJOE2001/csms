import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site/config";
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  return origin ? ["/", "/coffee-menu", "/visit"].map(path => ({ url: `${origin}${path}` })) : [];
}
