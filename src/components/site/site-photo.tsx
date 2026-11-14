"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { siteContent, type SitePhoto as PhotoAsset } from "@/lib/site/config";
import { BrandLogo } from "../brand-logo";

/** Keep readable text branding separate from concept photography inside a photo-booth frame. */
export function SitePhoto({
  photo,
  className,
  priority = false,
  sizes,
  parallax = false,
  interactiveTilt = false,
  frameLabel = "FRAME 01 • 35MM",
  stripMeta = "SIP&SNAP STUDIO • 5PM–9PM",
}: {
  photo: PhotoAsset;
  className?: string;
  priority?: boolean;
  sizes: string;
  parallax?: boolean;
  interactiveTilt?: boolean;
  frameLabel?: string;
  stripMeta?: string;
}) {
  const [developed, setDeveloped] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function toggleFilm() {
    setDeveloped(prev => !prev);
    setFlashing(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setFlashing(false), 320);
  }

  const photographyNote = (siteContent as { photographyNote?: string }).photographyNote;

  return <figure className={className ? `site-photo-frame ${className}` : "site-photo-frame"}>
    <div className="site-photo-strip-top" aria-hidden="true">
      <span>{frameLabel}</span>
      <span>{developed ? "DEVELOPED COLOR" : "B&W FILM"}</span>
    </div>
    <div
      className="site-photo-composition"
      data-parallax={parallax || undefined}
      data-interactive-tilt={interactiveTilt || undefined}
      data-film-mode={developed ? "color" : "bw"}
      data-flashing={flashing || undefined}
    >
      <Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} priority={priority} sizes={sizes} />
      {photo.sticker && <span className="site-cup-sticker" aria-hidden="true" style={{ left: `${photo.sticker.left}%`, top: `${photo.sticker.top}%`, width: `${photo.sticker.width}%` }}><BrandLogo alt="" /></span>}
      <span className="site-photo-viewfinder" aria-hidden="true" />
    </div>
    <div className="site-photo-strip-bar">
      <span className="site-photo-strip-meta" aria-hidden="true">{stripMeta}</span>
      <button
        type="button"
        className="site-photo-shutter"
        aria-pressed={developed}
        onClick={toggleFilm}
      >
        <Camera size={13} aria-hidden="true" />
        <span>{developed ? "B&W film" : "Develop photo"}</span>
      </button>
    </div>
    {photo.kind === "concept" && photographyNote && <figcaption>{photographyNote}</figcaption>}
  </figure>;
}
