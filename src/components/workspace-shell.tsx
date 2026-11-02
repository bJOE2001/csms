import type { ReactNode } from "react";
import { WorkspaceHeader } from "./workspace-header";

export function WorkspaceShell({
  active,
  shopName,
  children,
}: {
  active: "pos" | "menu" | "sales";
  shopName: string;
  children: ReactNode;
}) {
  return (
    <main
      className={`shell workspace-shell ${active === "pos" ? "pos-shell" : ""}`}
    >
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <WorkspaceHeader active={active} shopName={shopName} />
      <div className="workspace-content" id="workspace-main" tabIndex={-1}>
        {children}
      </div>
    </main>
  );
}
