import { signIn } from "./actions";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error === "invalid" ? "Enter a valid email and password." : error === "credentials" ? "Invalid email or password." : undefined;
  return <SignInForm action={signIn} initialError={message} />;
}
