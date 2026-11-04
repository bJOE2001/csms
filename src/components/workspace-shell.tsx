"use client";

import { useEffect, type ReactNode } from "react";
import { WorkspacePresentation, useWorkspaceFrame } from "./workspace-frame";
import type { WorkspaceModule } from "@/lib/workspace";

export function WorkspaceShell({
  active,
  shopName,
  children,
}: {
  active: WorkspaceModule;
  shopName: string;
  children: ReactNode;
}) {
  const register = useWorkspaceFrame();
  useEffect(() => { register?.(shopName); }, [register, shopName]);
  // Standalone previews retain the same composition without a second app shell.
  return register ? children : <WorkspacePresentation active={active} shopName={shopName}>{children}</WorkspacePresentation>;
}
