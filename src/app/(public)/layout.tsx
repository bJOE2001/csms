import type { ReactNode } from "react";
import { PublicShell } from "@/components/site/public-shell";
import { visitDetails } from "@/lib/site/config";
import "../landing.css";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell visit={visitDetails()}>{children}</PublicShell>;
}
