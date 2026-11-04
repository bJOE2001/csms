"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceHeader } from "./workspace-header";
import { workspaceModule, type WorkspaceModule } from "@/lib/workspace";

const WorkspaceFrameContext = createContext<((name: string) => void) | null>(null);
export const useWorkspaceFrame = () => useContext(WorkspaceFrameContext);

export function WorkspacePresentation({ active, shopName, children }: {
  active: WorkspaceModule; shopName: string; children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { content.current?.scrollTo({ top: 0, left: 0 }); }, [active]);
  return <main className={`shell workspace-shell ${active}-shell`}>
    <a className="skip-link" href="#workspace-main">Skip to content</a>
    <WorkspaceHeader active={active} shopName={shopName} />
    <div ref={content} className="workspace-content" id="workspace-main" tabIndex={-1}>{children}</div>
  </main>;
}

/** Root-owned presentation persists across modules; page/API auth boundaries stay intact. */
export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const active = workspaceModule(usePathname());
  const [shopName, setShopName] = useState("LOGO Coffee");
  if (!active) return children;
  return <WorkspaceFrameContext.Provider value={setShopName}>
    <WorkspacePresentation active={active} shopName={shopName}>{children}</WorkspacePresentation>
  </WorkspaceFrameContext.Provider>;
}
