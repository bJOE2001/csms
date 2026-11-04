"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, type ComponentProps } from "react";
import { useLoadingTransition } from "./global-loading-bar";

/** Root-owned transitions survive a drawer/link unmount. Next still owns routing,
 * prefetching, interruption and cached results; no click timer or fetch interception.
 */
export const LoadingLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof Link>>(
  function LoadingLink({ children, href, onNavigate, replace, scroll, ...props }, ref) {
    const router = useRouter();
    const startNavigation = useLoadingTransition();
    return <Link {...props} href={href} replace={replace} scroll={scroll} ref={ref} onNavigate={event => {
      let cancelled = false;
      onNavigate?.({ preventDefault: () => { cancelled = true; event.preventDefault(); } });
      // Preserve Link's full URL-object semantics for any existing object href.
      if (cancelled || typeof href !== "string") return;
      event.preventDefault();
      startNavigation(() => {
        if (replace) router.replace(href, { scroll });
        else router.push(href, { scroll });
      });
    }}>{children}</Link>;
  },
);
