# Menu and recipe records

## Publication and history

Categories contain products; each product can have multiple sellable variants. A new variant starts disabled. Each has an immutable sequence of price versions and recipe versions. The latest published version is current; publishing is immediate. Publication locks the variant row before assigning the next version, and database uniqueness prevents duplicate version numbers. An earlier version cannot be updated or deleted through either browser privileges or an accidental table-owner write.

Variant availability requires a published recipe. These configuration records now feed the implemented order, payment and inventory workflows; the original recipe snapshots remain immutable.

Recipe items save ingredient identity, ingredient name, base unit, quantity, waste allowance, and the estimated unit cost used at publication. Revising an ingredient estimate affects future publications. It does not recalculate existing recipe snapshots. The fixed base unit is `g`, `ml`, or `each`; an estimate is always expressed per one base unit.

## Precision and estimated costs

Selling prices use integer PHP centavos with a maximum equal to JavaScript's safe integer limit. User-entered prices are parsed from decimal strings using integer operations.

Ingredient quantities and estimated centavos per base unit use PostgreSQL `numeric(18,6)`. Queries cast these values to text before returning them to JavaScript. The browser's estimated-cost preview uses `BigInt` arithmetic. SQL recomputes the saved estimate independently; no browser total is accepted.

For this estimate, waste allowance means an additional percentage of the baseline quantity: 18 g with a 5% allowance is costed as 18 × 1.05 g. The exact sum is rounded upward once to the next whole centavo. This is a conservative display estimate. Checkout deducts actual recipe consumption from the stock ledger using the approved moving weighted average policy; unknown inventory valuation remains unavailable. See `OPERATIONS.md` for actual COGS and rounding rules.

An unknown estimate is `NULL`, not zero. If any required ingredient has no estimate, the recipe's cost status is `unavailable` and no total is shown. An explicitly entered zero is a known zero estimate. Both the status and cost snapshot are stored on the recipe version.

## Authorization and audit

Management routes and server actions share `requireFounder`. SQL functions independently check the caller's active founder membership. Authenticated browser roles have SELECT privileges only on menu/recipe tables; mutations run through restricted functions. Composite shop/entity foreign keys prevent cross-shop references, including inside functions that bypass RLS. Staff can read their shop's menu and price versions, while ingredient estimates, recipes/costs, and audit logs are founder-only.

Category/product/variant creation, price publication, ingredient creation/estimate changes, recipe publication, and availability changes are audited in the same transaction. Shop, membership, and device changes also have audit triggers. Audit rows are append-only and omit credentials/tokens.

The authorization pattern follows [Supabase's RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function guidance](https://supabase.com/docs/guides/database/functions). Composite relationships follow [PostgreSQL foreign key constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).
