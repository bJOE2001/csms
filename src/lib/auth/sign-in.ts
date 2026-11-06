import { z } from "zod";

export type SignInState = { status: "idle" | "error"; message?: string; fieldErrors?: { email?: string; password?: string } };
export const credentialsSchema = z.object({
  email: z.string().min(1, "Enter your email.").email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password.").max(256, "Password must be 256 characters or fewer."),
});
export function credentialErrors(email: unknown, password: unknown) {
  const parsed = credentialsSchema.safeParse({ email, password });
  if (parsed.success) return undefined;
  const fields = z.flattenError(parsed.error).fieldErrors;
  return { email: fields.email?.[0], password: fields.password?.[0] };
}
