import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "../brand-logo";

/** Presentation only; account pages retain their own actions and validation. */
export function AccountShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="shell">
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="LOGO Coffee home"
        >
          <BrandLogo />
        </Link>
        <Link className="top-link" href="/">
          Home
        </Link>
      </header>
      <section className="auth-card" aria-labelledby="account-title">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="account-title">{title}</h1>
        <p className="hint">{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
    </main>
  );
}
