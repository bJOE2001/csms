import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";
import { can } from "@/lib/auth/permissions";
import { workspaceModules } from "@/lib/workspace";
export default async function Home() {
  const { access } = await requireMember();
  redirect(workspaceModules.find(module => can(access, module.key))?.href ?? "/access-denied");
}
