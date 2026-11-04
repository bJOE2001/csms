import type { ImgHTMLAttributes } from "react";
export default function Image({ fill, priority, unoptimized, ...props }: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) {
  void priority; void unoptimized;
  // Browser fixture renders the same assets; production image optimization is tested separately.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img {...props} style={{ ...props.style, ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}) }} />;
}
