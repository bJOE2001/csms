import type { Metadata } from "next";
import { LibrariesWorkspace } from "@/components/libraries/libraries-workspace";

export default function LibrariesPage() {
  return <LibrariesWorkspace />;
}

export const metadata: Metadata = { title: "Libraries", robots: { index: false, follow: false } };
