import Link from "next/link";
export default function Home() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          Coffee POS
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
