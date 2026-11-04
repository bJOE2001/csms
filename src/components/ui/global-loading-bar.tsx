"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode, type TransitionStartFunction } from "react";

type Finish = () => void;
const BeginLoading = createContext<() => Finish>(() => () => {});
const LoadingState = createContext(false);
const LoadingTransition = createContext<TransitionStartFunction>(action => { void action(); });

/** Explicit scopes only: no fetch/router interception or invented progress. */
export function LoadingProvider({ children }: { children: ReactNode }) {
  const scopes = useRef(new Set<symbol>());
  const [busy, setBusy] = useState(false);
  const [transitionPending, startTransition] = useTransition();
  const begin = useCallback(() => {
    const token = Symbol();
    scopes.current.add(token);
    if (scopes.current.size === 1) setBusy(true);
    return () => {
      if (!scopes.current.delete(token)) return;
      if (!scopes.current.size) setBusy(false);
    };
  }, []);
  useEffect(() => {
    if (transitionPending) return begin();
  }, [transitionPending, begin]);
  return <BeginLoading.Provider value={begin}>
    <LoadingTransition.Provider value={startTransition}>
      <LoadingState.Provider value={busy}>
        <GlobalLoadingBar />
        {children}
      </LoadingState.Provider>
    </LoadingTransition.Provider>
  </BeginLoading.Provider>;
}

export const useBeginLoading = () => useContext(BeginLoading);
export const useLoadingTransition = () => useContext(LoadingTransition);

export function useLoadingSignal(pending: boolean) {
  const begin = useBeginLoading();
  useEffect(() => {
    if (pending) return begin();
  }, [pending, begin]);
}

export function GlobalLoadingBar() {
  const busy = useContext(LoadingState);
  return <div className="global-loading-bar" data-busy={busy} role="status" aria-live="polite" aria-atomic="true">
    <span className="global-loading-segment" aria-hidden="true" />
    <span className="sr-only">{busy ? "Loading workspace…" : null}</span>
  </div>;
}
