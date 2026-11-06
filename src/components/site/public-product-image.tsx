"use client";
import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { PublicProduct } from "@/lib/site/public-menu";

function optimizedImage(src: string) {
  if (src.startsWith("/")) return true;
  try {
    const image = new URL(src);
    return image.hostname === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname && image.pathname.startsWith("/storage/v1/object/public/");
  } catch { return false; }
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
      <ImageIcon size={28} strokeWidth={1} aria-hidden="true" />
      <span>{product.image ? "Product photo unavailable" : "Product photo coming soon"}</span>
    </div>}
  </div>;
}
