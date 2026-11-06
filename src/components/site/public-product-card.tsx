"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ImageIcon } from "lucide-react";
import type { PublicProduct } from "@/lib/site/public-menu";
import { money } from "@/lib/sales/domain";

function optimizedImage(src: string) {
  if (src.startsWith("/")) return true;
  try {
    const image = new URL(src);
    return image.hostname === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname && image.pathname.startsWith("/storage/v1/object/public/");
  } catch { return false; }
}
export function PublicProductCard({ product, featured = false }: { product: PublicProduct; featured?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <article className="site-product" id={`product-${product.id}`}>
    <div className="site-product-photo">
      {product.image && !failed ? <Image src={product.image} alt={product.name} fill sizes={featured ? "(max-width: 600px) calc(100vw - 40px), (max-width: 1100px) 44vw, 22vw" : "(max-width: 600px) calc(100vw - 40px), (max-width: 900px) 44vw, 30vw"} unoptimized={!optimizedImage(product.image)} onError={() => setFailed(true)} />
        : <div className="site-photo-fallback"><ImageIcon size={32} strokeWidth={1} aria-hidden="true" /><span>Product photo coming soon</span></div>}
    </div>
    <div className="site-product-meta"><span>{product.category}</span><span>{product.sizes.some(size => size.price !== product.price) ? "From " : ""}{money(product.price)}</span></div>
    <h3>{product.name}</h3>{product.description && <p>{product.description}</p>}
    {product.sizes.length > 0 && <ul className={`site-product-sizes${featured ? " site-featured-sizes" : ""}`} aria-label={`Available sizes for ${product.name}`}>{product.sizes.map(size => <li key={size.label}><span>{size.label}</span>{!featured && <strong>{money(size.price)}</strong>}</li>)}</ul>}
    {featured && <Link prefetch={false} className="site-text-link" href={`/coffee-menu#product-${product.id}`}>View {product.name}<ArrowUpRight size={16} aria-hidden="true" /></Link>}
  </article>;
}
