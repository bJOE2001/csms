import { coffeeBrand } from "@/lib/brand";
import { ArrowUpRight, Clock3, MapPin } from "lucide-react";
import type { VisitDetails } from "@/lib/site/config";

export function VisitSection({ visit, standalone = false }: { visit: VisitDetails; standalone?: boolean }) {
  const Heading = standalone ? "h1" : "h2";
  return <section className="site-visit site-section" id="visit" aria-labelledby="visit-title">
    <div className="site-visit-intro"><p className="site-kicker">FIND {coffeeBrand.name}</p><Heading id="visit-title">Your next<br /><em>coffee stop.</em></Heading><p>A little time for yourself. A catch-up with your people.<br />Find your way to {coffeeBrand.name}.</p>
      {visit.directions && <a className="site-button site-button-dark" href={visit.directions} target="_blank" rel="noopener noreferrer">Get Directions<ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only"> (opens Google Maps in a new tab)</span></a>}
    </div>
    <div className="site-visit-details">
      <div><MapPin size={22} aria-hidden="true" /><h3>Find us here</h3><p>{visit.address || "Our address will be shared here soon."}</p></div>
      <div><Clock3 size={22} aria-hidden="true" /><h3>Make time for coffee</h3><p>{visit.hours || "Opening hours will be shared here soon."}</p></div>
      {(visit.email || visit.phone) && <div><h3>Say hello</h3>{visit.email && <a href={`mailto:${visit.email}`}>{visit.email}</a>}{visit.phone && <a href={`tel:${visit.phone.replace(/[^+\d]/g, "")}`}>{visit.phone}</a>}</div>}
      {(visit.instagram || visit.facebook) && <nav className="site-social-links" aria-label={`${coffeeBrand.name} social media`}>{visit.instagram && <a href={visit.instagram} target="_blank" rel="noopener noreferrer">Instagram<span className="sr-only"> (opens a new tab)</span><ArrowUpRight size={16} aria-hidden="true" /></a>}{visit.facebook && <a href={visit.facebook} target="_blank" rel="noopener noreferrer">Facebook<span className="sr-only"> (opens a new tab)</span><ArrowUpRight size={16} aria-hidden="true" /></a>}</nav>}
    </div>
  </section>;
}
