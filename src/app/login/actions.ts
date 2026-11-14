"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { credentialErrors, credentialsSchema, type SignInState } from "@/lib/auth/sign-in";

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const values = {
    email: formData.get("email"),
    password: formData.get("password"),
  };
  const fieldErrors = credentialErrors(values.email, values.password);
  if (fieldErrors) return { status: "error", fieldErrors };
  const credentials = credentialsSchema.parse(values);

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) return { status: "error", message: error.status === 429
      ? "Too many attempts. Please wait and try again."
      : error.name === "AuthRetryableFetchError" || (error.status !== undefined && error.status >= 500)
        ? "Sign-in is unavailable. Please check your connection and try again."
        : "Invalid email or password." };
  } catch {
    return { status: "error", message: "Sign-in is unavailable. Please check your connection and try again." };
  }
  redirect("/dashboard");
}
