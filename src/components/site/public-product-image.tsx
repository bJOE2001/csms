"use client";
import Image from "next/image";
import { useState } from "react";
import type { PublicProduct } from "@/lib/site/public-menu";

function optimizedImage(src: string) {
  if (src.startsWith("/")) return true;
  try {
    const image = new URL(src);
    return image.hostname === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname && image.pathname.startsWith("/storage/v1/object/public/");
  } catch { return false; }
}

/** Monochrome studio line-art illustrations tailored by menu category when a product photo is absent. */
function ProductFallbackArtwork({ name, category }: { name: string; category: string }) {
  const hint = `${name} ${category}`.toLowerCase();

  if (/(iced|matcha|cold|chilled|non-coffee)/.test(hint)) {
    return (
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 22h24l-3 30H23l-3-30z" />
        <path d="M18 22h28l-2-5H20l-2 5z" />
        <path d="M35 17l3-9h6" />
        <rect x="24" y="30" width="6" height="6" rx="1" />
        <rect x="33" y="34" width="6" height="6" rx="1" />
        <path d="M22 42h20" />
      </svg>
    );
  }

  if (/(food|croissant|sandwich|bread|toast)/.test(hint)) {
    return (
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="32" cy="45" rx="22" ry="6" />
        <path d="M16 36c3-9 10-14 16-14s13 5 16 14c-4 3-9 4-16 4s-12-1-16-4z" />
        <path d="M25 23l-2 16" />
        <path d="M39 23l2 16" />
        <path d="M32 22v18" />
      </svg>
    );
  }

  if (/(dessert|snack|brownie|cookie|cake|sweet)/.test(hint)) {
    return (
      <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="32" cy="34" r="16" />
        <ellipse cx="32" cy="50" rx="21" ry="4" />
        <circle cx="26" cy="29" r="1.5" fill="currentColor" />
        <circle cx="36" cy="27" r="1.5" fill="currentColor" />
        <circle cx="38" cy="37" r="1.5" fill="currentColor" />
        <circle cx="27" cy="39" r="1.5" fill="currentColor" />
        <circle cx="32" cy="34" r="1.5" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 26h22v12a11 11 0 0 1-22 0V26z" />
      <path d="M40 29h4a5 5 0 0 1 0 10h-4" />
      <ellipse cx="29" cy="50" rx="18" ry="4" />
      <path d="M24 18c0-2 2-3 2-5" />
      <path d="M30 17c0-2 2-3 2-5" />
      <path d="M36 18c0-2 2-3 2-5" />
    </svg>
  );
}

/** Keep stored images intact inside a reserved, uncropped photography frame. */
export function PublicProductImage({ product, sizes }: { product: PublicProduct; sizes: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const [loadedImage, setLoadedImage] = useState<string | null>(null);
  const image = product.image && failedImage !== product.image ? product.image : null;
  const loading = Boolean(image && loadedImage !== image);
  return <div className="site-product-photo" data-loading={loading || undefined} aria-busy={loading || undefined}>
    {image ? <>
      <Image src={image} alt={product.name} fill sizes={sizes} loading="lazy"
        unoptimized={!optimizedImage(image)}
        onLoad={() => setLoadedImage(image)} onError={() => setFailedImage(image)} />
      {loading && <span className="sr-only">Loading image for {product.name}</span>}
    </> : <div className="site-photo-fallback" role="img" aria-label={`${product.name}: ${product.image ? "product photo unavailable" : "product photo coming soon"}`}>
      <span className="site-photo-fallback-emblem" aria-hidden="true">
        <ProductFallbackArtwork name={product.name} category={product.category} />
      </span>
      <small className="site-photo-fallback-category" aria-hidden="true">{product.category}</small>
      <span>{product.image ? "Product photo unavailable" : "Product photo coming soon"}</span>
    </div>}
  </div>;
}
