"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
export type JoinState = { status: "idle" | "error" | "success"; message?: string };
export async function joinShop(_previous: JoinState, form: FormData): Promise<JoinState> {
  const parsed = z.object({ token: z.uuid(), intent: z.enum(["accept", "sign_in", "create"]) }).safeParse({ token: form.get("token"), intent: form.get("intent") });
  if (!parsed.success) return { status: "error", message: "This invitation is invalid. Ask the owner for a new link." };
  let destination = "/app";
  let shouldAccept = true;
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("membership_invite_details", { p_token: parsed.data.token });
    const invite = data as { email?: string } | null;
    if (error || !invite?.email) return { status: "error", message: "This invitation is expired or unavailable. Ask the owner for a new link." };
    if (parsed.data.intent !== "accept") {
      const password = z.string().min(parsed.data.intent === "create" ? 8 : 1).max(256).safeParse(form.get("password"));
      if (!password.success) return { status: "error", message: parsed.data.intent === "create" ? "Use a password with at least 8 characters." : "Enter your password." };
      if (parsed.data.intent === "create") {
        if (form.get("password") !== form.get("confirm")) return { status: "error", message: "Passwords do not match." };
        const name = z.string().trim().min(1).max(120).safeParse(form.get("name"));
        if (!name.success) return { status: "error", message: "Enter your name (up to 120 characters)." };
        const requestHeaders = await headers();
        const origin = process.env.APP_URL || requestHeaders.get("origin");
        if (!origin) return { status: "error", message: "Account setup is unavailable. Please try again." };
        const next = `/join?token=${parsed.data.token}`;
        const auth = await db.auth.signUp({ email: invite.email, password: password.data,
          options: { data: { display_name: name.data, invite_token: parsed.data.token }, emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` } });
        if (auth.error) {
          const code = auth.error.code;
          const msg = auth.error.message ?? "";
          if (code === "user_already_exists" || /already registered/i.test(msg)) {
            return { status: "error", message: "An account with this email already exists. Please sign in on the login page." };
          }
          if (code === "over_email_send_rate_limit" || /rate limit/i.test(msg)) {
            return { status: "error", message: "Supabase email limit reached. Turn off 'Confirm email' in Supabase Dashboard → Authentication → Providers → Email, then try again." };
          }
          return { status: "error", message: msg || "Account setup could not be completed." };
        }
        shouldAccept = Boolean(auth.data.session);
        destination = "/login?created=1";
      } else {
        const auth = await db.auth.signInWithPassword({ email: invite.email, password: password.data });
        if (auth.error) return { status: "error", message: "Sign-in failed. Check your password and confirm your email first." };
      }
    }
    if (shouldAccept) {
      const result = await db.rpc("accept_membership_invite", { p_token: parsed.data.token });
      if (result.error) return { status: "error", message: result.error.code === "P0001" || result.error.code === "42501"
        ? result.error.message : "The invitation could not be accepted. Confirm your email and retry." };
      if (destination !== "/app") await db.auth.signOut();
    }
  } catch { return { status: "error", message: "Account access is unavailable. Please try again." }; }
  redirect(destination);
}
