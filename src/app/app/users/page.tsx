import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/require-member";
import { WorkspaceShell } from "@/components/workspace-shell";
import { UsersWorkspace } from "@/components/users/users-workspace";
export const metadata: Metadata = { title: "Users", robots: { index: false, follow: false } };
export default async function UsersPage() {
  const member = await requireMember("users");
  return <WorkspaceShell active="users" shopName={member.shop.name} access={member.access}><UsersWorkspace /></WorkspaceShell>;
}
