import type { Metadata } from "next";
import Link from "next/link";
export const metadata: Metadata = { title: "Access Unavailable", robots: { index: false, follow: false } };
export default function AccessDeniedPage() {
  return <main className="shell"><section className="auth-card">
    <h1>Access unavailable</h1>
    <p>Your account has no available workspace. Ask your shop owner to review your access.</p>
    <Link href="/app">Check access again</Link>
    <form action="/auth/sign-out" method="post"><button className="nav-link" type="submit">Sign out</button></form>
  </section></main>;
}
