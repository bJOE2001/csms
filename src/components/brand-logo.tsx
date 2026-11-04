/** The approved artwork is shared unchanged by workspace and account headers. */
export function BrandLogo() {
  return (
    <span className="brand-artwork">
      {/* Serve the original transparent PNG without optimizer transformations. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/LogoWithWhiteStoke.png" alt="LOGO Coffee" width={1774} height={887}
        className="brand-logo" decoding="async" />
    </span>
  );
}
