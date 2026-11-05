import { SignInForm } from "@/components/sign-in-form";

export function SignInFixture() {
  return <SignInForm action={async () => {
    document.documentElement.dataset.signInCalls = String(Number(document.documentElement.dataset.signInCalls ?? 0) + 1);
    await new Promise(resolve => setTimeout(resolve, 400));
    if (location.search.includes("network")) throw new TypeError("Test-only transport interruption");
    return { status: "error", message: "Invalid email or password." };
  }} />;
}
