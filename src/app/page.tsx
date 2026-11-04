import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          <BrandLogo />
        </Link>
        <Link className="nav-link" href="/sign-in">
          Sign in
        </Link>
      </header>
      <section className="hero">
        <p className="eyebrow">Your coffee shop, simply</p>
        <h1>
          Sell a cup.
          <br />
          See how your day adds up.
        </h1>
        <p className="hint">A simple till and a clear record of your sales.</p>
        <Link className="button mt-6" href="/pos">
          Open POS
        </Link>
      </section>
    </main>
  );
}
