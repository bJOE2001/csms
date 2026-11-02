"use client";
import { useState } from "react";
import { Icon } from "../ui/icon";

/** Neutral item identifier until the shop has actual product photography. */
export function ProductThumbnail({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl?: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const initials = (name.match(/[\p{L}\p{N}]+/gu) ?? [])
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("")
    .toLocaleUpperCase();
  return (
    <span className="product-thumbnail" aria-hidden="true">
      {imageUrl &&
      imageUrl !== failedUrl &&
      (/^https:\/\//.test(imageUrl) || /^\/(?!\/)/.test(imageUrl)) ? (
        // User-hosted menu images do not require an optimizer host allowlist.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          width={92}
          height={120}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <>
          <Icon name="image" size={20} />
          <span>{initials}</span>
        </>
      )}
    </span>
  );
}
