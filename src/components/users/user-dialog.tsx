"use client";
import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { legacyStaffPermissions, type Permissions } from "@/lib/auth/permissions";
import type { ShopUser } from "@/lib/users/domain";
import { MutationForm } from "../mutation-form";
import { FormDialog } from "../ui/form-dialog";
import { Input } from "../ui/primitives/input";
import { Select } from "../ui/select";
import { PermissionEditor } from "./permission-editor";

export async function saveUser(data: unknown) {
  const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw Error(result.error ?? "User changes could not be saved.");
  return result.data;
}
function UserForm({ user, refresh }: { user?: ShopUser; refresh: () => Promise<unknown> }) {
  const [permissions, setPermissions] = useState<Permissions>(user ? user.permissions ?? legacyStaffPermissions : { pos: ["view", "checkout"] });
  return <MutationForm submitLabel={user ? "Save access" : "Create invitation"} action={async (_previous, form) => {
    try {
      await saveUser(user ? { action: "update", id: user.id, status: form.get("status"), permissions }
        : { action: "invite", email: form.get("email"), permissions });
      await refresh();
      return { status: "success", message: user ? "User access updated." : "Invitation created. Copy its link to share with the user." };
    } catch (error) { return { status: "error", message: error instanceof Error ? error.message : "User changes could not be saved." }; }
  }}>
    {user ? <>
      <p className="user-dialog-identity"><strong>{user.display_name || user.email}</strong><span>{user.email}</span></p>
      <label className="field">Account status<Select name="status" defaultValue={user.status === "suspended" ? "suspended" : "active"}
        options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }]} /></label>
    </> : <label className="field">Email address<Input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="staff@example.com" /></label>}
    <PermissionEditor value={permissions} onChange={setPermissions} />
  </MutationForm>;
}
export function UserDialog({ user, refresh }: { user?: ShopUser; refresh: () => Promise<unknown> }) {
  return <FormDialog trigger={user ? null : <><UserPlus size={18} aria-hidden="true" />Invite User</>}
    triggerClassName="accent" triggerLabel={user ? `Edit access for ${user.email}` : undefined}
    tableAction={user ? { icon: Pencil, tooltip: "Edit access" } : undefined}
    title={user ? "Edit user access" : "Invite user"} size="lg" className="user-access-dialog"
    description={user ? "Choose their account status, available modules, and allowed actions." : "Create a private link for this email address. The user can sign in or create an account to join."}>
    <UserForm user={user} refresh={refresh} />
  </FormDialog>;
}
