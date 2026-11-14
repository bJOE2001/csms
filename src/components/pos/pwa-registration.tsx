"use client";

import { useEffect } from "react";

export type PosOfflineStatus = "preparing" | "ready" | "development" | "unsupported" | "insecure" | "error";

function publishStatus(status: PosOfflineStatus) {
  document.documentElement.dataset.posOfflineStatus = status;
  if (status === "ready") document.documentElement.dataset.posOfflineReady = "true";
  else delete document.documentElement.dataset.posOfflineReady;
  window.dispatchEvent(new Event("pos-offline-status"));
  if (status === "ready") window.dispatchEvent(new Event("pos-offline-ready"));
}

/** Mount in POS. Readiness means its public document and dependencies are cached. */
export function PosPwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      publishStatus("development");
      return;
    }
    if (!window.isSecureContext) {
      publishStatus("insecure");
      return;
    }
    if (!("serviceWorker" in navigator)) {
      publishStatus("unsupported");
      return;
    }
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let timeout: number | undefined;
    const preparationFailed = () => {
      if (!disposed && document.documentElement.dataset.posOfflineReady !== "true") publishStatus("error");
    };
    const trackPreparation = () => {
      if (document.documentElement.dataset.posOfflineReady === "true") return;
      publishStatus("preparing");
      window.clearTimeout(timeout);
      timeout = window.setTimeout(preparationFailed, 30000);
    };
    const onMessage = (event: MessageEvent) => {
      if (disposed || event.data?.type !== "POS_SHELL_READY") return;
      window.clearTimeout(timeout);
      publishStatus("ready");
    };
    const prepare = () => {
      trackPreparation();
      registration?.active?.postMessage({ type: "POS_PREPARE_SHELL" });
      void registration?.update().catch(() => {});
    };
    trackPreparation();
    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("online", prepare);
    void (async () => {
      try {
        registration = await navigator.serviceWorker.register("/service-worker.js", {
          scope: "/", updateViaCache: "none",
        });
        const ready = await navigator.serviceWorker.ready;
        if (!disposed) ready.active?.postMessage({ type: "POS_PREPARE_SHELL" });
      } catch {
        preparationFailed();
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", prepare);
    };
  }, []);
  return null;
}
