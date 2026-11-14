"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { WorkspaceHeader } from "./workspace-header";
import { workspaceModule, type WorkspaceModule } from "@/lib/workspace";
import { coffeeBrand } from "@/lib/brand";
import { can, type MemberAccess } from "@/lib/auth/permissions";
import { AccessContext } from "./access-context";

const WorkspaceFrameContext = createContext<((name: string, access?: MemberAccess) => void) | null>(null);
export const useWorkspaceFrame = () => useContext(WorkspaceFrameContext);

export function WorkspacePresentation({ active, shopName, children, access }: {
  active: WorkspaceModule; shopName: string; children: ReactNode; access?: MemberAccess | null;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.scrollTo({ top: 0, left: 0 }); }, [active]);
  return <main className={`shell workspace-shell ${active}-shell`}>
    <a className="skip-link" href="#workspace-main">Skip to content</a>
    <WorkspaceHeader active={active} shopName={shopName} access={access} />
    <div ref={content} className="workspace-content" id="workspace-main" tabIndex={-1}>{children}</div>
  </main>;
}

/** Root-owned presentation persists across modules; page/API auth boundaries stay intact. */
export function WorkspaceFrame({ children, initialAccess }: { children: ReactNode; initialAccess?: MemberAccess }) {
  const active = workspaceModule(usePathname());
  const router = useRouter();
  const [shopName, setShopName] = useState<string>(coffeeBrand.name);
  const [access, setAccess] = useState<MemberAccess | null>(initialAccess ?? null);
  const register = useCallback((name: string, next?: MemberAccess) => {
    setShopName(name);
    if (next) setAccess(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, []);
  useEffect(() => {
    if (!active || initialAccess) return;
    let current = true;
    const refresh = async () => {
      if (!navigator.onLine) return;
      try {
        const response = await fetch("/api/access", { cache: "no-store" });
        if (!current) return;
        if (response.status === 401) { setAccess(null); router.replace("/login"); return; }
        if (response.status === 403) { setAccess(null); router.replace("/access-denied"); return; }
        if (!response.ok) return;
        const result = await response.json();
        if (!current) return;
        register(result.shop.name, result.access);
        if (!can(result.access, active)) router.replace("/app");
        else router.refresh();
      } catch { /* Offline POS retains its last confirmed permissions. */ }
    };
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    return () => { current = false; window.removeEventListener("focus", focus); };
  }, [active, initialAccess, register, router]);
  if (!active) return children;
  return <WorkspaceFrameContext.Provider value={register}><AccessContext.Provider value={access}>
    <WorkspacePresentation active={active} shopName={shopName} access={access}>{children}</WorkspacePresentation>
    </AccessContext.Provider>
  </WorkspaceFrameContext.Provider>;
}
