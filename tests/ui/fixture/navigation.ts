const router = {
  refresh() { window.dispatchEvent(new Event("fixture:refresh")); },
  replace(href: string) {
    window.history.replaceState(null, "", href);
    if (!sessionStorage.getItem("fixture:hold-navigation"))
      window.dispatchEvent(new Event("fixture:navigate"));
  },
};

export function useRouter() { return router; }
