"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function DashboardError({ reset }: { reset: () => void }) {
  return <section className="auth-card" role="alert">
    <h1>Dashboard unavailable</h1>
    <p className="hint">Check your connection and try again.</p>
    <div className="actions"><Button onClick={reset}>Try again</Button><Link className="button secondary" href="/pos">Open POS</Link></div>
  </section>;
}
