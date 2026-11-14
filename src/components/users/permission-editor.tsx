"use client";
import { actionLabels, permissionModules, type PermissionAction, type PermissionModule, type Permissions } from "@/lib/auth/permissions";

export function PermissionEditor({ value, onChange }: { value: Permissions; onChange: (value: Permissions) => void }) {
  const toggle = (module: PermissionModule, action: PermissionAction, checked: boolean) => {
    const selected = value[module] ?? [];
    const next = action === "view" && !checked ? []
      : checked ? [...new Set([...selected, "view" as const, action])]
      : selected.filter(item => item !== action);
    onChange({ ...value, [module]: next });
  };
  return <fieldset className="permission-editor">
    <legend>Module access and actions</legend>
    <p className="hint">Enable View to open a module, then choose the actions this user can perform.</p>
    {permissionModules.map(module => {
      const selected = value[module.key] ?? [];
      return <fieldset className="permission-module" key={module.key}>
        <legend>{module.label}</legend>
        <label className="menu-checkbox permission-view">
          <input type="checkbox" aria-label={`${module.label}: View`} checked={selected.includes("view")} onChange={event => toggle(module.key, "view", event.target.checked)} />
          View
        </label>
        <div className="permission-actions">
          {module.actions.filter(action => action !== "view").map(action => <label key={action} className="menu-checkbox">
            <input type="checkbox" aria-label={`${module.label}: ${actionLabels[action]}`} disabled={!selected.includes("view")}
              checked={selected.includes(action)} onChange={event => toggle(module.key, action, event.target.checked)} />
            {actionLabels[action]}
          </label>)}
          {module.actions.length === 1 && <span className="hint">Read business performance</span>}
        </div>
      </fieldset>;
    })}
    <p className="hint permission-owner-note">User Management is reserved for owners. Owners always have full access.</p>
  </fieldset>;
}
