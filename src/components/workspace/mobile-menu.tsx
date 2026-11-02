"use client";
import { useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
export function MobileMenu({ children }: { children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return <details className="mobile-menu" ref={menu}>
    <summary aria-label="Open navigation"><Icon name="navigation" /><span>Menu</span></summary>
    <div className="mobile-menu-content" onClick={event => { if ((event.target as HTMLElement).closest("a") && menu.current) menu.current.open = false; }}>{children}</div>
  </details>;
}
