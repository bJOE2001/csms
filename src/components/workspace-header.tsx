import Link from "next/link";
import { Icon } from "@/components/ui/icon";
export function WorkspaceHeader({
  active,
  shopName,
}: {
  active: string;
  shopName: string;
  role?: string;
}) {
  return (
    <aside className="workspace-sidebar">
      <Link className="workspace-brand" href="/pos">
        <span className="workspace-brand-icon">
          <Icon name="coffee" size={26} />
        </span>
        <span>
          {shopName}
        </span>
      </Link>
      <nav className="workspace-nav" aria-label="Shop">
        <Link
          className={`nav-link ${active === "pos" ? "selected" : ""}`}
          aria-current={active === "pos" ? "page" : undefined}
          href="/pos"
        >
          <Icon name="dashboard" />
          POS
        </Link>
        <Link
          className={`nav-link ${active === "menu" ? "selected" : ""}`}
          aria-current={active === "menu" ? "page" : undefined}
          href="/menu"
        >
          <Icon name="menu" />
          Menu
        </Link>
        <Link
          className={`nav-link ${active === "sales" ? "selected" : ""}`}
          aria-current={active === "sales" ? "page" : undefined}
          href="/app/sales"
        >
          <Icon name="sales" />
          Sales
        </Link>
        <Link
          className={`nav-link ${active === "expenses" ? "selected" : ""}`}
          aria-current={active === "expenses" ? "page" : undefined}
          href="/expenses"
        >
          <Icon name="wallet" />
          Expenses
        </Link>
      </nav>
      <div className="sidebar-footer">
        <form action="/auth/sign-out" method="post">
          <button className="nav-link" type="submit">
            <Icon name="logout" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
