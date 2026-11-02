import { signIn } from "@/app/sign-in/actions";
import Link from "next/link";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const message = error === "invalid" ? "Enter a valid email and password." : error === "credentials" ? "Those credentials could not be verified." : undefined;
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">◒</span>
          <span>COFFEE SHOP MANAGEMENT</span>
        </Link>
        <Link className="top-link" href="/">Home</Link>
      </header>
      <section className="auth-card">
        <div className="eyebrow">Founder and staff access</div>
        <h1>Sign in</h1>
        <p className="hint">Use your founder or staff account. Ask a founder if you need access.</p>
        {message && <p className="hint" role="alert" style={{ color: "#9b3527" }}>{message}</p>}
        <form action={signIn}>
          <label className="field">Email<input name="email" type="email" autoComplete="email" required /></label>
          <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button" type="submit">Continue</button>
        </form>
        <p><Link className="top-link" href="/forgot-password">Forgot your password?</Link></p>
      </section>
    </main>
  );
}
