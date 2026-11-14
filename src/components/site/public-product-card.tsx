"use client";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import type { PublicProduct } from "@/lib/site/public-menu";
import { money } from "@/lib/sales/domain";
import { Dialog } from "../ui/dialog";
import { DialogBody } from "../ui/dialog-layout";
import { PublicProductImage } from "./public-product-image";

function ProductSizes({ product }: { product: PublicProduct }) {
  return product.sizes.length > 0 && <ul className="site-product-sizes" aria-label={`Available sizes for ${product.name}`}>
    {product.sizes.map(size => <li key={size.label}><span>{size.label}</span><strong>{money(size.price)}</strong></li>)}
  </ul>;
}

export function PublicProductCard({ product, featured = false, staggerIndex }: { product: PublicProduct; featured?: boolean; staggerIndex?: number }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const price = <>{product.sizes.some(size => size.price !== product.price) ? "From " : ""}{money(product.price)}</>;
  const sizes = featured
    ? "(min-width: 1400px) 302px, (min-width: 1200px) 23vw, (min-width: 640px) 46vw, calc(100vw - 40px)"
    : "(min-width: 1400px) 411px, (min-width: 1200px) 31vw, (min-width: 640px) 46vw, calc(100vw - 40px)";
  return <article className="site-product" id={`product-${product.id}`} data-reveal={featured ? "" : undefined} style={({ "--stagger-index": staggerIndex ?? 0 } as CSSProperties)}>
    <PublicProductImage product={product} sizes={sizes} />
    <div className="site-product-info">
      <div className="site-product-meta"><span>{product.category}</span><strong>{price}</strong></div>
      <h3>{product.name}</h3>
      {product.description && <p className="site-product-description">{product.description}</p>}
      <ProductSizes product={product} />
      <div className="site-product-action">
        {featured ? <Link prefetch={false} className="site-text-link" href={`/menu#product-${product.id}`} aria-label={`View ${product.name} on the full menu`}><span className="sr-only">View details</span></Link>
          : <button type="button" className="site-text-link" onClick={() => setDetailsOpen(true)} aria-label={`View details for ${product.name}`}><span className="sr-only">View details</span></button>}
      </div>
    </div>
    {!featured && <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} title={product.name} size="lg" className="coffee-site site-product-dialog">
      <DialogBody className="site-product-detail-body">
        <PublicProductImage product={product} sizes="(min-width: 768px) 300px, calc(100vw - 80px)" />
        <div className="site-product-detail-copy"><div className="site-product-meta"><span>{product.category}</span><strong>{price}</strong></div>
          {product.description && <p>{product.description}</p>}
          <ProductSizes product={product} />
        </div>
      </DialogBody>
    </Dialog>}
  </article>;
}
