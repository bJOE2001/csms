"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

function appUrl() {
  const url = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Configure an HTTPS APP_URL.");
  return url.origin;
}
export async function requestPasswordReset(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z.email().safeParse(form.get("email"));
  if (!parsed.success)
    return { status: "error", validation: true, message: "Enter a valid email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password`,
  });
  if (error)
    return { status: "error", message: "The recovery email could not be requested. Please try again." };
  return {
    status: "success",
    message:
      "If that account exists, a password recovery email has been requested. Check your inbox.",
  };
}
export async function changePassword(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const parsed = z.string().min(12).max(256).safeParse(form.get("password"));
  if (!parsed.success)
    return {
      status: "error",
      message: "Use a password with at least 12 characters.",
      validation: true,
    };
  if (form.get("password") !== form.get("confirm"))
    return { status: "error", validation: true, message: "Passwords do not match." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      status: "error",
      message: "Open a valid recovery link or sign in first.",
    };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error)
    return {
      status: "error",
      message: "Password could not be updated. Request a fresh recovery link.",
    };
  return {
    status: "success",
    message: "Password updated. You can return to your workspace.",
  };
}
