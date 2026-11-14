"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/require-member";

export async function createShop() {
  await requireMember();
  redirect("/app");
}
