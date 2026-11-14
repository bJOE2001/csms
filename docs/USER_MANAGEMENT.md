# User Management and access control

Owners open **User Management** at `/app/users`. They can invite staff, edit each staff member's module and action permissions, suspend access, restore access, and revoke pending invitations. Owner accounts retain full access and cannot be restricted or suspended from this screen. Suspending a user preserves receipts, inventory movements, membership, and audit history.

The access editor offers these grants:

| Module | Available actions |
| --- | --- |
| Dashboard | View |
| POS | View, Complete sales |
| Menu | View, Add, Edit, Delete |
| Inventory | View, Add, Edit, Manage stock, Manage recipes, Return stock |
| Sales | View, Refund, Print receipts, Export |
| Expenses | View, Add, Edit, Delete |
| Libraries | View, Add, Edit, Delete |

An action requires View for its module. Disabling View removes the module's action grants. An empty map grants no workspace access. User Management remains owner-only. Inventory stock changes include opening stock, receipts, counts, wastage, and corrections. Adding an item with opening stock requires both Add and Manage stock. Product and category upserts check Add for a new record and Edit for an existing record, including direct RPC requests.

Invitations default to POS View and Complete sales. After creating an invitation, the owner copies its private link and shares it with the invited person. The app does not automatically send an invitation email. Links expire after seven days. The invited person signs in or creates an account from `/join`; membership acceptance requires the same verified email. New accounts may first need to follow their Supabase confirmation email. Auth confirmation redirects must allow the application's `/auth/callback` URL. Invitation links can be revoked before acceptance. Repeating acceptance for the same account is safe.

## Enforcement and shared reads

Navigation and action controls use the same permission catalog as the server. Middleware and server pages check module access. The POS catalog API checks the requesting workspace. Mutation RPCs check the exact action using active shop membership, independently of the browser. Permissions and membership writes serialize using the existing shop transaction lock. Direct product, category, sales, and expense reads use RLS. Existing private checkout and product helpers remain inaccessible to authenticated callers. The old staff command boundary also respects POS checkout grants.

Sales and Dashboard grants include the financial records needed for their reports, including expenses and stock return credits; a separate Expenses grant controls opening its workspace and maintaining expenses. Catalog data is shared by POS, Menu, Libraries, and Inventory. Print and CSV export controls operate on records already authorized for viewing.

Changes take effect on subsequent server requests; mounted pages refresh access on focus. Offline POS uses the last confirmed catalog and permissions. A disconnected device cannot learn about remote revocation until it reconnects; the server rejects unauthorized queued sales without deleting the saved outbox. Do not use offline availability as an immediate remote revocation mechanism.

## Rollout and rollback

Apply `supabase/migrations/202611140002_user_access_control.sql` after the existing recipe and offline checkout migrations. It adds nullable permission columns and replaces permission guards without deleting or rewriting business history. Existing staff with NULL permissions retain their previous POS/checkout and read access until an owner explicitly saves a map. New invitations store an explicit map. The frontend reads membership rows compatibly before migration and displays a clear migration message in User Management until its RPCs are installed.

If SQL Editor reports that `shop_permission_catalog` already exists, reopen the updated migration file and run the entire file again. It replaces existing functions, skips existing columns, restores missing validation checks, and recreates its policies within one transaction. Repeated runs preserve users, saved permissions, invitations, and business records.

The migration also updates the existing product-image authorization helper. `supabase/storage/product-images.sql` remains usable before or after this upgrade; it uses action grants when available. Keep the schema migration in place when rolling back the frontend so database permissions continue to protect records. Do not drop permission columns or restore broad legacy guards as part of a frontend rollback.

Validation: `npm test`, `npm run build`, `python tests/database/check-simple-pos.py`, and `npx playwright test --config playwright.ui.config.ts user-access.spec.ts navigation.spec.ts branding.spec.ts expenses.spec.ts menu-recipe-refinement.spec.ts`.
