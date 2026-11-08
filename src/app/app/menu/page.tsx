import type { Metadata } from "next";
import { MenuWorkspace } from "@/components/menu/menu-workspace";
export default function MenuPage() {
  return <MenuWorkspace />;
}

export const metadata: Metadata = { title: "Menu Management", robots: { index: false, follow: false } };
