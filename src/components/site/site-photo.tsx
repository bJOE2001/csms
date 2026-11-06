import Image from "next/image";
import { siteContent, type SitePhoto as PhotoAsset } from "@/lib/site/config";
import { BrandLogo } from "../brand-logo";

/** Keep the supplied artwork separate from generated photography so its lettering never changes. */
export function SitePhoto({ photo, className, priority = false, sizes }: {
  photo: PhotoAsset; className?: string; priority?: boolean; sizes: string;
}) {
  return <figure className={className}>
    <div className="site-photo-composition">
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} priority={priority} sizes={sizes} />
      {photo.sticker && <span className="site-cup-sticker" aria-hidden="true" style={{ left: `${photo.sticker.left}%`, top: `${photo.sticker.top}%`, width: `${photo.sticker.width}%` }}><BrandLogo alt="" /></span>}
    </div>
    {photo.kind === "concept" && <figcaption>{siteContent.photographyNote}</figcaption>}
  </figure>;
}
