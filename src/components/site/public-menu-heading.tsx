import Link from "next/link";

export function PublicMenuHeading() {
  return <header className="site-menu-heading">
    <p className="site-kicker">FIND YOUR NEXT FAVORITE</p>
    <h1>Something for <em>your kind of moment.</em></h1>
    <p>Explore our current selections, sizes, and prices.<br className="site-menu-description-break" /> Choose your favorite, then <Link href="/visit">come see us</Link>.</p>
  </header>;
}
