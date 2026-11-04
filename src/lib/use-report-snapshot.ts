"use client";

import { useEffect, useRef } from "react";

/** Keep a complete successful report through failed refreshes, scoped to its shop. */
export function useReportSnapshot<T>(scope: string, report: T | null): T | null {
  const previous = useRef({ scope, report });
  useEffect(() => {
    if (report || previous.current.scope !== scope) previous.current = { scope, report };
  }, [scope, report]);
  return report ?? (previous.current.scope === scope ? previous.current.report : null);
}
