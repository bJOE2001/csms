import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { siteContent, type VisitDetails } from "@/lib/site/config";
import { VisitSection } from "./visit-section";

export function PublicLanding({ menu, visit }: { menu: ReactNode; visit: VisitDetails }) {
  return <>
    <section className="site-hero site-section" aria-labelledby="coffee-headline">
      <div className="site-hero-content"><p className="site-kicker">{siteContent.eyebrow}</p>
        <h1 id="coffee-headline">{siteContent.headline[0]}<br /><em>{siteContent.headline[1]}</em></h1>
        <p className="site-hero-description">{siteContent.description}</p>
        <div className="site-hero-actions"><Link prefetch={false} className="site-button site-button-dark" href="/coffee-menu">Explore Our Menu<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="site-text-link" href="/visit">Find Us<ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        <a className="site-scroll-cue" href="#featured"><ArrowDown size={18} aria-hidden="true" />A little coffee. A little pause.</a>
      </div>
      <figure className="site-hero-photo"><Image src={siteContent.hero.src} alt={siteContent.hero.alt} width={siteContent.hero.width} height={siteContent.hero.height} priority sizes="(max-width: 700px) 100vw, 52vw" /><figcaption>{siteContent.photographyNote}</figcaption><span className="site-photo-note" aria-hidden="true">Take a moment.<br /><em>Make it yours.</em></span></figure>
    </section>
    <div className="site-location-ribbon"><span>LOGO COFFEE · CARMEN, DAVAO DEL NORTE</span><span>{visit.hours}<i aria-hidden="true"> / </i><Link href="/visit">See you over coffee<ArrowUpRight size={16} aria-hidden="true" /></Link></span></div>
    <div id="featured">{menu}</div>
    <section className="site-story site-section" id="our-story" aria-labelledby="our-story-title">
      <figure><Image src={siteContent.storyImage.src} alt={siteContent.storyImage.alt} width={siteContent.storyImage.width} height={siteContent.storyImage.height} sizes="(max-width: 700px) 100vw, 45vw" /><figcaption>{siteContent.photographyNote}</figcaption></figure>
      <div className="site-story-copy"><p className="site-kicker">BOLD FLAVOR. WARM MOMENTS.</p><h2 id="our-story-title">More than<br /><em>just coffee.</em></h2><p>{siteContent.story}</p><p>A familiar order. A new favorite. A conversation that runs a little longer. Whatever your moment looks like, make a little room for it.</p><Link className="site-text-link" href="/visit">Make time for a visit<ArrowUpRight size={18} aria-hidden="true" /></Link><span className="site-story-signature">LOGO Coffee</span></div>
    </section>
    <section className="site-gallery site-section" aria-labelledby="gallery-title"><div className="site-section-heading"><div><p className="site-kicker">SLOW DOWN. LOOK A LITTLE CLOSER.</p><h2 id="gallery-title">A little coffee<br /><em>inspiration.</em></h2></div><p>{siteContent.photographyNote}</p></div><div className="site-gallery-grid"><figure><Image src={siteContent.hero.src} alt={siteContent.hero.alt} width={1600} height={1068} sizes="(max-width: 600px) 100vw, 60vw" /><figcaption>A little swirl. A little anticipation.</figcaption></figure><figure><Image src={siteContent.storyImage.src} alt={siteContent.storyImage.alt} width={1200} height={1600} sizes="(max-width: 600px) 100vw, 40vw" /><figcaption>Something warm to come back to.</figcaption></figure></div></section>
    <VisitSection visit={visit} />
    <section className="site-final-cta"><p className="site-kicker">MAKE YOUR NEXT MOMENT A COFFEE MOMENT</p><h2>Your next favorite<br /><em>cup is calling.</em></h2><p>See what&apos;s on the menu and find your way to LOGO Coffee.</p><div><Link prefetch={false} className="site-button" href="/coffee-menu">Explore the Menu<ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="site-button site-button-outline" href="/visit">Visit LOGO Coffee<ArrowUpRight size={18} aria-hidden="true" /></Link></div></section>
  </>;
}
