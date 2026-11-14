import type { Metadata } from "next";
import { LibrariesWorkspace } from "@/components/libraries/libraries-workspace";
import { requireMember } from "@/lib/auth/require-member";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function LibrariesPage() {
  const member = await requireMember("libraries");
  return <WorkspaceShell active="libraries" shopName={member.shop.name} access={member.access}><LibrariesWorkspace /></WorkspaceShell>;
}

export const metadata: Metadata = { title: "Libraries", robots: { index: false, follow: false } };
