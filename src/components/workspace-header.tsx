import Link from "next/link";
import { workspaceGroups } from "@/lib/workspace/navigation";
import { Icon } from "@/components/ui/icon";
import { ModuleFinder } from "@/components/workspace/module-finder";
import { MobileMenu } from "@/components/workspace/mobile-menu";

export function WorkspaceHeader({ active, shopName, role = "founder" }: { active: string; shopName: string; role?: string }) {
  const group = workspaceGroups.find(group => group.pages.some(page => page.id === active));
  const page = group?.pages.find(page => page.id === active);
  const navigation = () => <nav className="workspace-navigation" aria-label="Business workspace">{workspaceGroups.map(group => {
    const pages = group.pages.filter(page => !page.founder || role === "founder");
    return pages.length > 0 && <section className="nav-group" key={group.label}><h2>{group.label}</h2>{pages.map(page => <Link key={page.id} href={page.href} aria-current={active === page.id ? "page" : undefined}><Icon name={page.id} size={18} /><span>{page.label}</span></Link>)}</section>;
  })}</nav>;
  return <>
    <a className="skip-link" href="#workspace-main">Skip to page content</a>
    <aside className="workspace-sidebar" aria-label="Shop navigation">
      <Link className="workspace-brand" href="/app"><span className="workspace-brand-icon"><Icon name="coffee" size={24} /></span><span><strong>{shopName}</strong><small>Shop workspace</small></span></Link>
      {navigation()}
      <div className="sidebar-footer"><span className="access-label"><span className="status-dot" />{role === "founder" ? "Founder access" : "Staff access"}</span><form action="/auth/sign-out" method="post"><button type="submit" className="sign-out"><Icon name="logout" size={17} />Sign out</button></form></div>
    </aside>
    <header className="workspace-topbar"><div className="workspace-location"><MobileMenu><p className="mobile-shop-name">{shopName}</p>{navigation()}<div className="sidebar-footer"><span className="access-label">{role === "founder" ? "Founder access" : "Staff access"}</span><form action="/auth/sign-out" method="post"><button className="sign-out" type="submit"><Icon name="logout" size={17}/>Sign out</button></form></div></MobileMenu><span className="workspace-breadcrumb">{group?.label}<span aria-hidden="true">/</span><strong>{page?.label ?? "Overview"}</strong></span></div><div className="workspace-topbar-actions"><ModuleFinder role={role}/><Link className="button compact" href="/pos"><Icon name="pos" size={17} /><span>Open POS</span></Link></div></header>
  </>;
}
