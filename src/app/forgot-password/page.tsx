import type { Metadata } from "next";
import { Input } from "@/components/ui/primitives/input";
import Link from "next/link";
import { MutationForm } from "@/components/mutation-form";
import { requestPasswordReset } from "@/app/auth/account-actions";
import { AccountShell } from "@/components/ui/account-shell";

export default function ForgotPassword() {
  return (
    <AccountShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your account email to request a recovery link."
      footer={
        <Link className="top-link" href="/sign-in">
          Back to sign in
        </Link>
      }
    >
      <MutationForm
        action={requestPasswordReset}
        submitLabel="Request recovery email"
      >
        <label className="field">
          Account email
          <Input type="email" name="email" autoComplete="email" required />
        </label>
      </MutationForm>
    </AccountShell>
  );
}

export const metadata: Metadata = { title: "Reset Password", robots: { index: false, follow: false } };
