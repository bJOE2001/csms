import { OperationNotice } from "@/components/ui/operation-notice";
import { Input } from "@/components/ui/primitives/input";
import { signIn } from "@/app/sign-in/actions";
import Link from "next/link";
import { SubmitButton } from "@/components/ui/button";
import { AccountShell } from "@/components/ui/account-shell";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "invalid"
      ? "Enter a valid email and password."
      : error === "credentials"
        ? "Those credentials could not be verified."
        : undefined;
  return (
    <AccountShell
      eyebrow="Founder and staff access"
      title="Sign in"
      description="Use your founder or staff account. Ask a founder if you need access."
      footer={
        <Link className="top-link" href="/forgot-password">
          Forgot your password?
        </Link>
      }
    >
      {message && error === "credentials" && <OperationNotice title="Sign-in failed" description={message} />}
      {message && error === "invalid" && (
        <p className="form-message error" role="alert">
          {message}
        </p>
      )}
      <form action={signIn}>
        <label className="field">
          Email
          <Input name="email" type="email" autoComplete="email" required />
        </label>
        <label className="field">
          Password
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <SubmitButton pendingLabel="Signing in…">Continue</SubmitButton>
      </form>
    </AccountShell>
  );
}
