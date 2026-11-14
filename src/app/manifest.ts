import type { MetadataRoute } from "next";
import { coffeeBrand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/pos",
    name: `${coffeeBrand.name} POS`,
    short_name: coffeeBrand.name,
    description: "Coffee shop point of sale with offline cash sales and automatic syncing.",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    background_color: "#F7F7F7",
    theme_color: "#121212",
    icons: [
      { src: "/brand/text-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/text-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
