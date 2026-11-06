/** The approved artwork is shared unchanged by workspace and account headers. */
export function BrandLogo({ alt = "LOGO Coffee" }: { alt?: string }) {
  return (
    <span className="brand-artwork">
      {/* Serve the original transparent PNG without optimizer transformations. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/Logov1.png" alt={alt} width={1774} height={887}
        className="brand-logo" decoding="async" />
    </span>
  );
}
