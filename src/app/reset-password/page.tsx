import type { Metadata } from "next";
import { Input } from "@/components/ui/primitives/input";
import Link from "next/link";
import { MutationForm } from "@/components/mutation-form";
import { changePassword } from "@/app/auth/account-actions";
import { AccountShell } from "@/components/ui/account-shell";

export default function ResetPassword() {
  return (
    <AccountShell
      eyebrow="Account security"
      title="Choose a password"
      description="Use at least 12 characters. Enter the same password in both fields."
      footer={
        <Link className="top-link" href="/app">
          Return to workspace
        </Link>
      }
    >
      <MutationForm action={changePassword} submitLabel="Update password">
        <label className="field">
          New password
          <Input
            type="password"
            name="password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
            required
          />
        </label>
        <label className="field">
          Confirm password
          <Input
            type="password"
            name="confirm"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
            required
          />
        </label>
      </MutationForm>
    </AccountShell>
  );
}

export const metadata: Metadata = { title: "Choose a Password", robots: { index: false, follow: false } };
