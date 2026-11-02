import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Coffee shop management home">
          <span className="brand-mark" aria-hidden="true">◒</span>
          <span>COFFEE SHOP MANAGEMENT</span>
        </Link>
        <Link className="top-link" href="/sign-in">Sign in&nbsp; ↗</Link>
      </header>
      <section className="hero">
        <div>
          <div className="eyebrow">A calmer start for your coffee shop</div>
          <h1>Build the business before the first cup.</h1>
          <p className="hero-copy">Prepare your menu, recipes, suppliers, and startup costs in one dependable workspace. When you open, keep sales, stock, and funding clear and accountable.</p>
          <div className="actions">
            <Link className="button" href="/sign-in">Open your workspace</Link>
            <a className="button secondary" href="#principles">How it works</a>
          </div>
        </div>
        <aside className="preview" aria-label="Pre-opening dashboard preview">
          <div className="preview-head">
            <span className="preview-title">Your shop, getting ready</span>
            <span className="status"><i className="status-dot" /> PRE-OPENING</span>
          </div>
          <div className="metric">
            <div className="metric-label">Sales history</div>
            <div className="metric-value">Not started</div>
            <div className="metric-note">No operating transactions recorded</div>
          </div>
          <div className="metric">
            <div className="metric-label">Setup focus</div>
            <div className="metric-value">Menu &amp; recipes</div>
            <div className="metric-note">Prepare your first sellable items</div>
          </div>
          <div className="readiness">
            <strong>Plans stay separate from actuals</strong>
            <p>Budgets, estimated costs, and planned purchases won&apos;t be presented as recorded expenses, inventory, or sales.</p>
          </div>
        </aside>
      </section>
      <section id="principles" className="foot">Designed for one founder-managed branch. Currency is PHP. Offline checkout supports one designated POS device.</section>
    </main>
  );
}
