"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ShieldCheck, X } from "lucide-react";
import { can, accessFor, permissionModules } from "@/lib/auth/permissions";
import type { ShopInvitation, UsersData } from "@/lib/users/domain";
import { notify } from "@/lib/notify";
import { useBeginLoading } from "../ui/global-loading-bar";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { DataTable } from "../ui/data-table";
import { Select } from "../ui/select";
import { TableActionButton } from "../ui/table-action-button";
import { WorkspaceSkeleton } from "../ui/workspace-skeleton";
import { FormDialog } from "../ui/form-dialog";
import { MutationForm } from "../mutation-form";
import { saveUser, UserDialog } from "./user-dialog";

const views = [
  { key: "members", label: "Team Members" },
  { key: "invitations", label: "Invitations" },
] as const;

function RevokeInvitation({ invitation, refresh }: { invitation: ShopInvitation; refresh: () => Promise<unknown> }) {
  return <FormDialog trigger={null} triggerLabel={`Revoke invitation for ${invitation.email}`} tableAction={{ icon: X, tooltip: "Revoke invitation", variant: "destructive" }}
    title="Revoke invitation?" description={`The invitation link for ${invitation.email} will stop working.`} confirmation danger>
    <MutationForm submitLabel="Revoke invitation" action={async () => {
      try { await saveUser({ action: "revoke", id: invitation.id }); await refresh(); return { status: "success", message: "Invitation revoked." }; }
      catch (error) { return { status: "error", message: error instanceof Error ? error.message : "Invitation could not be revoked." }; }
    }}><p>This does not change any existing account or sales history.</p></MutationForm>
  </FormDialog>;
}
export function UsersWorkspace() {
  const [data, setData] = useState<UsersData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<(typeof views)[number]["key"]>("members");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteFilter, setInviteFilter] = useState("all");
  const requestId = useRef(0);
  const finishLoading = useRef<() => void>(() => {});
  const begin = useBeginLoading();
  const invalidate = useCallback(() => { requestId.current++; }, []);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    finishLoading.current();
    const finish = begin();
    finishLoading.current = finish;
    setLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const result = await response.json();
      if (id !== requestId.current) return false;
      if (response.status === 401 || response.status === 403) { setData(undefined); window.location.replace(response.status === 401 ? "/login" : "/app"); return false; }
      if (!response.ok) throw Error(result.error ?? "Users could not be loaded.");
      setData(result.data); setError(""); return true;
    } catch (failure) { if (id === requestId.current) setError(failure instanceof Error ? failure.message : "Users could not be loaded."); return false; }
    finally { finish(); if (id === requestId.current) setLoading(false); }
  }, [begin]);
  useEffect(() => {
    void refresh();
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    return () => { invalidate(); finishLoading.current(); window.removeEventListener("focus", focus); };
  }, [refresh, invalidate]);
  if (!data && !error) return <WorkspaceSkeleton module="users" track={false} />;
  const members = data?.members ?? [];
  const invitations = data?.invitations ?? [];
  const filteredMembers = members.filter(member =>
    (roleFilter === "all" || member.role === roleFilter) &&
    (statusFilter === "all" || member.status === statusFilter),
  );
  const filteredInvitations = invitations.filter(invite => {
    const expired = new Date(invite.expires_at).getTime() <= Date.now();
    return inviteFilter === "all" || (inviteFilter === "expired" ? expired : !expired);
  });
  const memberFiltersActive = roleFilter !== "all" || statusFilter !== "all";
  return <div className="menu-management users-workspace grid gap-6" aria-busy={loading}>
    <header className="users-header"><div><h1 className="m-0">User Management</h1><p className="hint mb-0 mt-2">Manage your team and control what each user can access and do.</p></div>
      {data && <UserDialog refresh={refresh} />}
    </header>
    {error && <p role="alert" className="form-message error">{error} <Button variant="outline" onClick={refresh}>Try again</Button></p>}
    {data && <>
      <dl className="menu-overview users-overview">
        {[["Team Members", members.length], ["Active Users", members.filter(member => member.status === "active").length], ["Suspended Users", members.filter(member => member.status === "suspended").length], ["Pending Invitations", invitations.filter(invite => new Date(invite.expires_at).getTime() > Date.now()).length]].map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}
      </dl>
      <nav className="inventory-views" aria-label="User management views">
        {views.map(tab => (
          <Button key={tab.key} variant={view === tab.key ? "default" : "outline"} aria-pressed={view === tab.key} onClick={() => setView(tab.key)}>
            {tab.label}
          </Button>
        ))}
      </nav>
      {view === "members" ? <Card className="menu-products"><DataTable caption="Team members" searchPlaceholder="Search name or email"
        emptyMessage={memberFiltersActive ? "No team members match these filters." : "No team members found."}
        toolbarLeading={<div className="menu-products-heading"><h2>Team Members</h2><p className="hint">Owners have full access. Staff use only the modules and actions you allow.</p></div>}
        actions={<div className="menu-filter-bar">
          <label className="field"><span className="sr-only">Role</span><Select aria-label="Role" value={roleFilter} onValueChange={setRoleFilter} options={[{ value: "all", label: "All roles" }, { value: "founder", label: "Owner" }, { value: "staff", label: "Staff" }]} /></label>
          <label className="field"><span className="sr-only">Status</span><Select aria-label="Status" value={statusFilter} onValueChange={setStatusFilter} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} /></label>
        </div>}
        paginationResetKey={roleFilter + statusFilter}
        columns={[{ key: "name", label: "User", kind: "primary", sortable: true }, { key: "role", label: "Role" }, { key: "status", label: "Status", kind: "status" }, { key: "access", label: "Module access" }, { key: "actions", label: "Actions", kind: "actions" }]}
        rows={filteredMembers.map(member => {
          const allowedModules = permissionModules.filter(module => can(accessFor(member.role, member.permissions), module.key));
          return { id: member.id, search: `${member.email} ${member.display_name ?? ""}`, sort: { name: member.display_name || member.email }, cells: {
            name: <><strong>{member.display_name || member.email}{member.user_id === data.user_id ? " (you)" : ""}</strong>{member.display_name && <small className="cell-description">{member.email}</small>}</>,
            role: <span className="inventory-type-pill">{member.role === "founder" ? "Owner" : "Staff"}</span>,
            status: <span className={member.status === "active" ? "menu-status menu-status-available" : "inventory-status inventory-status-out"}>{member.status === "active" ? "Active" : member.status === "suspended" ? "Suspended" : "Invited"}</span>,
            access: member.role === "founder" ? <span className="user-owner-access"><ShieldCheck size={16} aria-hidden="true" />Full access</span>
              : allowedModules.length ? <div className="user-module-pills">{allowedModules.map(module => <span key={module.key} className="inventory-type-pill">{module.label}</span>)}</div>
                : <span className="hint">No modules allowed</span>,
            actions: member.role === "founder" ? <span className="hint">Owner access</span> : <UserDialog user={member} refresh={refresh} />,
          } };
        })} />
      </Card> : <Card className="menu-products"><DataTable caption="User invitations" searchPlaceholder="Search invitation email"
        emptyMessage={inviteFilter !== "all" ? "No invitations match this filter." : "No pending invitations. Invite a user to add someone to your team."}
        toolbarLeading={<div className="menu-products-heading"><h2>Invitations</h2><p className="hint">Copy the private link and share it with the invited person. Links expire after seven days.</p></div>}
        actions={<div className="menu-filter-bar">
          <label className="field"><span className="sr-only">Status</span><Select aria-label="Status" value={inviteFilter} onValueChange={setInviteFilter} options={[{ value: "all", label: "All statuses" }, { value: "pending", label: "Pending" }, { value: "expired", label: "Expired" }]} /></label>
        </div>}
        paginationResetKey={inviteFilter}
        columns={[{ key: "email", label: "Email", kind: "primary", sortable: true }, { key: "expires", label: "Expires" }, { key: "status", label: "Status", kind: "status" }, { key: "actions", label: "Actions", kind: "actions" }]}
        rows={filteredInvitations.map(invite => {
          const expired = new Date(invite.expires_at).getTime() <= Date.now();
          return { id: invite.id, search: invite.email, sort: { email: invite.email }, cells: {
            email: <strong>{invite.email}</strong>, expires: new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(new Date(invite.expires_at)),
            status: <span className={expired ? "menu-status" : "inventory-status inventory-status-low"}>{expired ? "Expired" : "Pending"}</span>,
            actions: <div className="table-actions"><TableActionButton icon={Copy} label={`Copy invitation for ${invite.email}`} tooltip="Copy invitation link" disabled={expired} onClick={async () => {
              try { await navigator.clipboard.writeText(`${window.location.origin}/join?token=${invite.token}`); notify.success("Invitation link copied."); }
              catch { notify.error("Link could not be copied. Allow clipboard access and try again."); }
            }} /><RevokeInvitation invitation={invite} refresh={refresh} /></div>,
          } };
        })} />
      </Card>}
    </>}
  </div>;
}
