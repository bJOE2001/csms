"use client";

import { useEffect } from "react";
import { notify } from "@/lib/notify";

/** Announce an existing server-redirected operation error after hydration. */
export function OperationNotice({ title, description }: { title: string; description: string }) {
  useEffect(() => {
    notify.error(title, { id: "redirected-operation", description });
  }, [title, description]);
  return null;
}
