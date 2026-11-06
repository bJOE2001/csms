import { useSyncExternalStore } from "react";
let navigationVersion = 0;
const router = {
  refresh() { window.dispatchEvent(new Event("fixture:refresh")); },
  replace(href: string) {
    const version = ++navigationVersion;
    window.dispatchEvent(new CustomEvent("fixture:report-request", { detail: href }));
    if (sessionStorage.getItem("fixture:throw-navigation")) throw Error("Network unavailable");
    window.history.replaceState(null, "", href);
    const delay = Number(sessionStorage.getItem("fixture:navigation-delay") ?? 0);
    if (delay) return new Promise<void>(resolve => {
      // Match App Router's discarded-navigation behavior for delayed report fixtures.
      window.setTimeout(() => {
        if (version === navigationVersion && !sessionStorage.getItem("fixture:hold-navigation"))
          window.dispatchEvent(new Event("fixture:navigate"));
        resolve();
      }, delay);
    });
    if (!sessionStorage.getItem("fixture:hold-navigation"))
      window.dispatchEvent(new Event("fixture:navigate"));
  },
};

export function useRouter() { return router; }

export function usePathname() {
  return useSyncExternalStore(
    notify => {
      window.addEventListener("fixture:navigate", notify);
      window.addEventListener("popstate", notify);
      return () => { window.removeEventListener("fixture:navigate", notify); window.removeEventListener("popstate", notify); };
    },
    () => {
      if (window.location.pathname !== "/") return window.location.pathname;
      const query = new URLSearchParams(window.location.search);
      if (query.has("sales")) return "/app/sales";
      if (query.has("menu")) return "/app/menu";
      for (const moduleKey of ["dashboard", "pos", "libraries", "expenses"])
        if (query.has(moduleKey)) return `/${moduleKey}`;
      return "/";
    },
  );
}
