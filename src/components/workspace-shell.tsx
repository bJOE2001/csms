"use client";

import { useContext, useEffect, type ReactNode } from "react";
import { WorkspacePresentation, useWorkspaceFrame } from "./workspace-frame";
import type { WorkspaceModule } from "@/lib/workspace";
import type { MemberAccess } from "@/lib/auth/permissions";
import { AccessContext } from "./access-context";

export function WorkspaceShell({
  active,
  shopName,
  children,
  access,
}: {
  active: WorkspaceModule;
  shopName: string;
  children: ReactNode;
  access?: MemberAccess;
}) {
  const register = useWorkspaceFrame();
  const inherited = useContext(AccessContext);
  useEffect(() => { register?.(shopName, access); }, [register, shopName, access]);
  // Standalone previews retain the same composition without a second app shell.
  const content = <AccessContext.Provider value={access ?? inherited}>{children}</AccessContext.Provider>;
  return register ? content : <WorkspacePresentation active={active} shopName={shopName} access={access ?? inherited}>{content}</WorkspacePresentation>;
}
