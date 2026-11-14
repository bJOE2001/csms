import type { Metadata } from "next";
import { MenuWorkspace } from "@/components/menu/menu-workspace";
import { requireMember } from "@/lib/auth/require-member";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function MenuPage() {
  const member = await requireMember("menu");
  return <WorkspaceShell active="menu" shopName={member.shop.name} access={member.access}><MenuWorkspace /></WorkspaceShell>;
}

export const metadata: Metadata = { title: "Menu Management", robots: { index: false, follow: false } };
