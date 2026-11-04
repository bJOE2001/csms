import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "../brand-logo";
import { SiteHeader } from "./site-header";
import { siteContent, type VisitDetails } from "@/lib/site/config";

export function PublicShell({ children, visit }: { children: ReactNode; visit: VisitDetails }) {
  return <div className="coffee-site">
    <a className="site-skip-link" href="#public-main">Skip to content</a>
    <SiteHeader ordering={visit.ordering} />
    <main id="public-main" tabIndex={-1}>{children}</main>
    <footer className="site-footer"><div className="site-footer-brand"><Link href="/" className="site-logo" aria-label="LOGO Coffee home"><BrandLogo /></Link><p>Bold flavor.<br />Warm moments.</p></div>
      <nav aria-label="Footer navigation"><span>Make a little time</span><Link href="/coffee-menu" prefetch={false}>Our Menu</Link><Link href="/#our-story">Our Story</Link><Link href="/visit">Visit Us</Link></nav>
      <div className="site-footer-visit"><span>Come by LOGO Coffee</span>{visit.address && <p>{visit.address}</p>}{visit.hours && <p>{visit.hours}</p>}{visit.email && <a href={`mailto:${visit.email}`}>{visit.email}</a>}{visit.phone && <a href={`tel:${visit.phone.replace(/[^+\d]/g, "")}`}>{visit.phone}</a>}</div>
      <div className="site-footer-bottom"><small>© {new Date().getUTCFullYear()} {siteContent.name}</small><Link href="/sign-in" prefetch={false}>Team sign in</Link></div>
    </footer>
  </div>;
}
