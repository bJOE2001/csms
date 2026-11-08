import type { Metadata } from "next";
import { PosWorkspace } from "@/components/pos/pos-workspace";
export default function PosPage() {
  return <PosWorkspace />;
}

export const metadata: Metadata = { title: "POS", robots: { index: false, follow: false } };
