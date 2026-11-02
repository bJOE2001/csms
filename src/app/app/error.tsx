"use client";

import Link from "next/link";

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main className="auth-card" role="alert">
      <p className="eyebrow">Workspace unavailable</p>
      <h1>We couldn’t load this page.</h1>
      <p className="hint">
        Check your connection and that the database migrations have been
        applied, then try again.
      </p>
      <div className="actions">
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
        <Link className="button secondary" href="/app">
          Sales
        </Link>
      </div>
    </main>
  );
}
