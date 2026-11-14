import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Camera, ChevronDown, Clock, MapPin } from "lucide-react";
import { siteContent, type VisitDetails } from "@/lib/site/config";
import { VisitSection } from "./visit-section";
import { SitePhoto } from "./site-photo";

export function PublicLanding({ menu, visit }: { menu: ReactNode; visit: VisitDetails }) {
  return <>
    <section className="site-hero site-section" aria-labelledby="coffee-headline" data-reveal="visible">
      <div className="site-hero-content"><p className="site-kicker">{siteContent.eyebrow}</p>
        <h1 id="coffee-headline">{siteContent.headline[0]}<br /><em>{siteContent.headline[1]}</em></h1>
        <p className="site-hero-description">{siteContent.description}</p>
        <div className="site-hero-actions"><Link prefetch={false} className="site-button site-button-dark" href="/menu">Explore Our Menu<ArrowUpRight size={18} aria-hidden="true" /></Link><a className="site-text-link" href="#visit">Find Us<ArrowUpRight size={18} aria-hidden="true" /></a></div>
        {(visit.address || visit.hours) && <div className="site-hero-meta">{visit.address && <a className="site-hero-location" href="#visit"><MapPin size={16} aria-hidden="true" /><span>{visit.address}</span></a>}{visit.hours && <a className="site-hero-hours" href="#visit"><Clock size={16} aria-hidden="true" /><span>{visit.hours}</span></a>}</div>}
        <a className="site-scroll-cue" href="#featured"><ChevronDown size={16} aria-hidden="true" /><span>Scroll to explore</span></a>
      </div>
      <SitePhoto className="site-hero-photo" photo={siteContent.hero} priority parallax interactiveTilt frameLabel="FRAME 01 • HERO SNAP" stripMeta="SIP&SNAP • CARMEN, DDN" sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1440px) 45vw, 580px" />
    </section>
    <div id="featured">{menu}</div>
    <section className="site-story site-section" id="our-story" aria-labelledby="our-story-title" data-reveal="">
      <SitePhoto photo={siteContent.storyImage} parallax interactiveTilt frameLabel="STRIP 02 • BOOTH SESSION" stripMeta="5:00 PM – 9:00 PM • MEMORIES" sizes="(max-width: 700px) calc(100vw - 40px), 48vw" />
      <div className="site-story-copy"><p className="site-kicker">THE {siteContent.name} EXPERIENCE</p><h2 id="our-story-title">More than<br /><em>just coffee.</em></h2><p>{siteContent.story}</p><p className="site-story-announcement"><Camera size={15} aria-hidden="true" /><span>Photo booth experience coming soon.</span></p><a className="site-text-link" href="#visit">Make time for a visit<ArrowUpRight size={18} aria-hidden="true" /></a><p className="site-story-signature">Your cup. Your people. Your moment.</p></div>
    </section>
    <VisitSection visit={visit} />
    <section className="site-final-cta" aria-labelledby="final-cta-title" data-reveal=""><p className="site-kicker">MAKE IT A {siteContent.name} MOMENT</p><h2 id="final-cta-title">Your next favorite<br /><em>cup is calling.</em></h2><p>See what&apos;s on the menu and find your way to {siteContent.name}.</p><div><Link prefetch={false} className="site-button site-button-dark" href="/menu">Explore Menu<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="site-button site-button-outline" href="/visit">Visit {siteContent.name}<ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
  </>;
}
