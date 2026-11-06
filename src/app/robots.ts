import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site/config";
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return { rules: { userAgent: "*", allow: ["/", "/menu", "/visit"], disallow: ["/api/", "/app", "/dashboard", "/pos", "/expenses", "/libraries", "/auth/", "/sign-in", "/forgot-password", "/reset-password"] }, ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}) };
}
