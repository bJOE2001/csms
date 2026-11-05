import { coffeeBrand } from "@/lib/brand";

/** The approved artwork is shared unchanged by workspace and account headers. */
export function BrandLogo() {
  return (
    <span className="brand-artwork">
      {/* Serve the original transparent PNG without optimizer transformations. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={coffeeBrand.logo.src} alt={coffeeBrand.name} width={coffeeBrand.logo.width} height={coffeeBrand.logo.height}
        className="brand-logo" decoding="async" />
    </span>
  );
}
