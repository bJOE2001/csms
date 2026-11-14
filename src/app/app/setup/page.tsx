import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";

export default async function SetupPage() {
  await requireMember();
  redirect("/app");
}

export const metadata: Metadata = { title: "Shop Setup", robots: { index: false, follow: false } };
