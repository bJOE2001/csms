"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ExpensesError({ reset }: { reset: () => void }) {
  return <section className="auth-card" role="alert">
    <h1>Expenses unavailable</h1>
    <p className="hint">Check your connection and database migrations, or choose a date range of up to one year.</p>
    <div className="actions">
      <Button onClick={reset}>Try again</Button>
      <Link className="button secondary" href="/expenses">Reset dates</Link>
      <Link className="nav-link" href="/app/sales">Sales</Link>
    </div>
  </section>;
}
