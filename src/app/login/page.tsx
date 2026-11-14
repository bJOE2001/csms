import type { Metadata } from "next";
import { signIn } from "./actions";
import { SignInForm } from "@/components/sign-in-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; confirmed?: string; created?: string }> }) {
  const { error, confirmed, created } = await searchParams;
  const message = error === "invalid" ? "Enter a valid email and password." : error === "credentials" ? "Invalid email or password." : undefined;
  const notice = message ? undefined
    : created === "1" ? "Account created successfully. Sign in with your email and password to continue."
    : confirmed === "1" ? "Email confirmed. Sign in with your email and password to continue."
    : undefined;
  return <SignInForm action={signIn} initialError={message} initialNotice={notice} />;
}

export const metadata: Metadata = { title: "Sign In", robots: { index: false, follow: false } };
