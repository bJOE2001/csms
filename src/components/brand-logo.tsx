import { coffeeBrand } from "@/lib/brand";

/** Plain text branding until a business logo is available. */
export function BrandLogo({ alt = coffeeBrand.name }: { alt?: string }) {
  return (
    <span className="brand-artwork" aria-hidden={alt === "" || undefined}>
      <span className="brand-wordmark">{coffeeBrand.name}</span>
    </span>
  );
}
