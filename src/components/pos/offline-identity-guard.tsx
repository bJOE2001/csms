"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { deactivateCatalog, markOfflineSignedOut } from "@/lib/pos/offline-store";

/** Opening account entry revokes the last offline session, preserving its outbox. */
export function OfflineIdentityGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === "/login") {
      markOfflineSignedOut();
      void deactivateCatalog().catch(() => {});
    }
  }, [pathname]);
  return null;
}
