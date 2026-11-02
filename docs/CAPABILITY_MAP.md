# Capability map: Coffee shop management system

The PRD bundles independently verifiable business domains. Build in this dependency order so each increment has enforceable data boundaries.

| Module | Responsibility | Depends on |
|---|---|---|
| identity | Authentication, shops, membership, roles, RLS | — |
| menu-recipes | Categories, products, price history, ingredients, versioned recipes | identity |
| operations | POS, payments, inventory ledger, purchase receiving, shifts | identity, menu-recipes |
| offline-sync | Durable local queue, idempotent atomic processing, diagnostics | identity, menu-recipes, operations |
| finance | Budgets, founder funding, expenses, reconciliation | identity, operations |
| reporting | Pre-opening readiness and actual operational reporting | menu-recipes, operations, offline-sync, finance |

All listed MVP modules are implemented locally, including durable offline checkout and idempotent synchronization. See `IMPLEMENTATION_STATUS.md` for verification evidence and remaining hosted deployment gates, and `CAPABILITIES.md` for the detailed completion map.
