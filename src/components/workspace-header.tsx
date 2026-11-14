"use client";

import { LoadingLink as Link } from "./ui/loading-link";
import { workspaceModules as modules } from "@/lib/workspace";
import { useEffect, useRef, useState, type Ref } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "./ui/button";
import { BrandLogo } from "./brand-logo";
import { coffeeBrand, displayShopName } from "@/lib/brand";
import { deactivateCatalog, markOfflineSignedOut } from "@/lib/pos/offline-store";
import { can, type MemberAccess } from "@/lib/auth/permissions";

function NavigationLinks({ active, onNavigate, navigationRef, access }: {
  active: string;
  onNavigate?: () => void;
  navigationRef?: Ref<HTMLElement>;
  access?: MemberAccess | null;
}) {
  return (
    <nav ref={navigationRef} className="workspace-nav" aria-label="Shop">
      {modules.filter(item => can(access, item.key)).map(item => (
        <Link key={item.key} href={item.href}
          className={"nav-link " + (active === item.key ? "selected" : "")}
          aria-current={active === item.key ? "page" : undefined}
          onClick={event => {
            if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
              onNavigate?.();
          }}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function SignOut() {
  return (
    <div className="sidebar-footer">
      <form action="/auth/sign-out" method="post" onSubmit={async event => {
        event.preventDefault();
        const form = event.currentTarget;
        markOfflineSignedOut();
        await deactivateCatalog().catch(() => {});
        form.submit();
      }}>
        <button className="nav-link" type="submit"><Icon name="logout" />Sign out</button>
      </form>
    </div>
  );
}

export function WorkspaceHeader({ active, shopName, access }: {
  active: string;
  shopName: string;
  role?: string;
  access?: MemberAccess | null;
}) {
  const label = displayShopName(shopName);
  const [open, setOpen] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const desktopNavigation = useRef<HTMLElement>(null);
  useEffect(() => {
    setOpen(false);
    const desktop = window.matchMedia("(min-width: 1280px)");
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [active]);

  return (
    <>
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" href="/app" aria-label={label === coffeeBrand.name ? coffeeBrand.name : coffeeBrand.name + " — " + label} title={label}>
          <BrandLogo />
        </Link>
        <NavigationLinks active={active} access={access} navigationRef={desktopNavigation} />
        <SignOut />
      </aside>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <header className="workspace-mobile-header">
          <Link className="workspace-mobile-brand" href="/app" aria-label={label === coffeeBrand.name ? coffeeBrand.name : coffeeBrand.name + " — " + label} title={label}>
            <BrandLogo />
          </Link>
          <Dialog.Trigger asChild>
            <Button variant="ghost" size="icon" className="navigation-toggle" aria-label="Open navigation menu">
              <Menu size={22} strokeWidth={1.6} aria-hidden="true" />
            </Button>
          </Dialog.Trigger>
        </header>
        <Dialog.Portal>
          <Dialog.Overlay className="workspace-nav-overlay" />
          <Dialog.Content className="workspace-navigation-drawer"
            onOpenAutoFocus={event => {
              event.preventDefault();
              closeButton.current?.focus();
            }}
            onCloseAutoFocus={event => {
              // The compact trigger is hidden after a desktop resize.
              if (window.matchMedia("(min-width: 1280px)").matches) {
                event.preventDefault();
                desktopNavigation.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({ preventScroll: true });
              }
            }}>
            <Dialog.Title className="sr-only">Navigation menu</Dialog.Title>
            <Dialog.Description className="sr-only">Choose a workspace or sign out of {coffeeBrand.name}.</Dialog.Description>
            <div className="navigation-drawer-heading">
              <div className="workspace-mobile-brand"><BrandLogo /></div>
              <Dialog.Close asChild>
                <Button ref={closeButton} variant="ghost" size="icon" className="navigation-toggle" aria-label="Close navigation menu">
                  <X size={22} strokeWidth={1.6} aria-hidden="true" />
                </Button>
              </Dialog.Close>
            </div>
            <NavigationLinks active={active} access={access} onNavigate={() => setOpen(false)} />
            <SignOut />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
