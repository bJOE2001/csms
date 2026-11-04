"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { BrandLogo } from "../brand-logo";

const links = [["Home", "/"], ["Menu", "/coffee-menu"], ["Our Story", "/#our-story"], ["Visit Us", "/visit"]] as const;
export function SiteHeader({ ordering }: { ordering?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const closeButton = useRef<HTMLButtonElement>(null);
  const desktopNav = useRef<HTMLElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 900px)");
    const close = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  const navigation = <>{links.map(([label, href]) => <Link prefetch={false} href={href} key={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}</>;
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <header className="site-header"><div className="site-header-inner">
      <Link href="/" className="site-logo" aria-label="LOGO Coffee home"><BrandLogo /></Link>
      <nav ref={desktopNav} className="site-desktop-nav" aria-label="Customer navigation">{navigation}</nav>
      {ordering ? <a className="site-button site-header-cta" href={ordering} target="_blank" rel="noopener noreferrer">Order Now<ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only"> (opens a new tab)</span></a> : <Link prefetch={false} className="site-button site-header-cta" href="/coffee-menu">View Menu<ArrowUpRight size={17} aria-hidden="true" /></Link>}
      <Dialog.Trigger asChild><button className="site-menu-toggle" aria-label="Open customer navigation"><Menu size={24} aria-hidden="true" /></button></Dialog.Trigger>
    </div></header>
    <Dialog.Portal><Dialog.Overlay className="site-nav-overlay" /><Dialog.Content className="site-nav-drawer" onOpenAutoFocus={event => { event.preventDefault(); closeButton.current?.focus(); }} onCloseAutoFocus={event => {
      if (window.matchMedia("(min-width: 900px)").matches) { event.preventDefault(); desktopNav.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus(); }
    }}>
      <div className="site-nav-drawer-heading"><BrandLogo /><Dialog.Close asChild><button ref={closeButton} className="site-menu-toggle" aria-label="Close customer navigation"><X size={24} aria-hidden="true" /></button></Dialog.Close></div>
      <Dialog.Title className="sr-only">Customer navigation</Dialog.Title><Dialog.Description className="sr-only">Explore LOGO Coffee, our menu, story, and visit information.</Dialog.Description>
      <nav aria-label="Customer navigation">{navigation}</nav><p>Bold flavor. Warm moments.</p>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
