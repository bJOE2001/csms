import type { Metadata } from "next";
import { requireMember } from "@/lib/auth/require-member";
import { salesRange, shopDate } from "@/lib/sales/period";
import { WorkspaceShell } from "@/components/workspace-shell";
import { InventoryWorkspace } from "@/components/inventory/inventory-workspace";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const member = await requireMember("inventory");
  const today = shopDate(member.shop.timezone), { from, to } = salesRange(await searchParams, today);
  return <WorkspaceShell active="inventory" shopName={member.shop.name} access={member.access}><InventoryWorkspace today={today} from={from} to={to} /></WorkspaceShell>;
}

export const metadata: Metadata = { title: "Inventory", robots: { index: false, follow: false } };
