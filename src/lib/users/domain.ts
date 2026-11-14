import { z } from "zod";
import { permissionModules, type MemberAccess, type Permissions } from "@/lib/auth/permissions";

export const permissionsSchema = z.record(z.string(), z.array(z.string())).superRefine((value, ctx) => {
  for (const [module, actions] of Object.entries(value)) {
    const definition = permissionModules.find(item => item.key === module);
    if (!definition || actions.some(action => !definition.actions.some(allowed => allowed === action)) || new Set(actions).size !== actions.length || (actions.length > 0 && !actions.includes("view")))
      ctx.addIssue({ code: "custom", message: "Choose valid actions and enable View for each allowed module." });
  }
}).transform(value => value as Permissions);
export const userRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email: z.email().max(254).transform(value => value.trim().toLowerCase()), permissions: permissionsSchema }),
  z.object({ action: z.literal("update"), id: z.uuid(), status: z.enum(["active", "suspended"]), permissions: permissionsSchema }),
  z.object({ action: z.literal("revoke"), id: z.uuid() }),
]);
export type ShopUser = {
  id: string; user_id: string; email: string; display_name: string | null;
  role: MemberAccess["role"]; status: "active" | "invited" | "suspended";
  permissions: Permissions | null; created_at: string;
};
export type ShopInvitation = {
  id: string; email: string; token: string; status: "pending" | "accepted" | "revoked";
  expires_at: string; permissions: Permissions | null;
};
export type UsersData = { members: ShopUser[]; invitations: ShopInvitation[]; user_id: string };
