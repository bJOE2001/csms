import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site/config";
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return { rules: { userAgent: "*", allow: ["/", "/menu", "/visit"], disallow: ["/api/", "/app", "/dashboard", "/pos", "/expenses", "/libraries", "/auth/", "/login", "/sign-in", "/forgot-password", "/reset-password", "/join", "/access-denied"] }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
