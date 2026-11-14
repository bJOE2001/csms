"use client";
import { createContext, useContext } from "react";
import { can, type MemberAccess, type PermissionAction, type PermissionModule } from "@/lib/auth/permissions";

export const AccessContext = createContext<MemberAccess | null>(null);
export function useCan(module: PermissionModule | "users", action: PermissionAction = "view", legacyAllowed = false) {
  const access = useContext(AccessContext);
  return access ? can(access, module, action) : legacyAllowed;
}
