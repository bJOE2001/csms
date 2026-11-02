# NO BUSINENESS NAME FOR NOW
## Product Requirements Document (PRD)

**Version:** 1.0  
**Status:** Draft for development  
**Product Type:** Coffee Shop Management System  
**Initial Business Model:** Single-branch, founder-operated coffee shop  
**Primary Users:** Co-founders and authorized staff  
**Initial Release:** MVP  
**Currency:** Philippine Peso (PHP)  
**Connectivity Requirement:** Offline-capable POS with synchronization

---

## 1. Executive Summary

NO BUSINENESS NAME FOR NOW is a coffee shop management system designed to manage the preparation, opening, and daily operations of a small coffee shop.

The system will centralize point-of-sale (POS) operations, menu management, recipe costing, ingredient inventory, supplier purchases, founder contributions, operating expenses, payment reconciliation, and financial reporting.

The application must support offline order processing on one designated POS device. Transactions created during internet outages must be stored locally and synchronized safely when connectivity returns.

The system will initially be used exclusively by the founders and authorized staff. Public customer ordering, customer accounts, and online payment gateway integration are outside the initial MVP scope.

### 1.1 Product vision

Provide the founders of NO BUSINENESS NAME FOR NOW with one dependable system to operate their coffee shop, maintain accurate financial records, control ingredient usage, and make informed business decisions.

### 1.2 Product objectives

1. Establish the business configuration before the shop opens.
2. Record real sales and payments from the first transaction.
3. Calculate ingredient consumption and estimated product profitability.
4. Track actual purchases, startup funding, and operating expenses.
5. Support uninterrupted order recording during temporary internet outages.
6. Provide transparent financial and operational records to all authorized founders.
7. Establish an architecture that can support future public ordering and business growth.

---

## 2. Business Context

NO BUSINENESS NAME FOR NOW is being developed by a group of friends who are also co-founders of the planned coffee shop.

At the start of development:

- The business has not yet opened.
- Ingredients and equipment have not yet been purchased.
- No real sales or inventory history exists.
- The founders intend to share management responsibilities.
- The founders intend to contribute equally to startup funding.
- One POS device will be used initially.
- The developer is also one of the co-founders.
- The founders will initially handle cashier duties themselves.

The application must therefore support a pre-opening state in which products, recipes, budgets, and supplier information can be prepared without fabricating sales, purchases, inventory, or profit data.

Equal funding does not automatically establish equal legal ownership or profit-sharing entitlements. Those arrangements must be agreed upon separately and represented accurately in the system.

---

## 3. Scope

### 3.1 In scope for MVP

- Authentication and founder/staff permissions
- Single-branch business configuration
- Menu and product management
- Product variants, sizes, and add-ons
- Recipe and ingredient costing
- Supplier directory
- Purchase recording and receiving
- Ingredient-level inventory
- Stock movements and wastage
- Internal POS for dine-in and takeout
- Cash and manually recorded e-wallet payments
- Offline order persistence and synchronization
- Startup budget and founder contribution tracking
- Operating expense tracking
- Cashier shift and payment reconciliation
- Sales, gross profit, and estimated operating profit reporting
- Audit logging
- Basic exports and backups

### 3.2 Out of scope for MVP

- Public customer-facing ordering
- Customer accounts and loyalty programs
- Online payment gateway processing
- Multi-branch operations
- Multi-device offline inventory synchronization
- Payroll and employee scheduling
- Full accounting and tax filing automation
- AI chatbots and predictive analytics
- Automated supplier ordering
- Advanced customer relationship management

### 3.3 Future expansion

The architecture should leave room for public ordering, customer accounts, promotions, loyalty rewards, multi-branch support, and advanced analytics without requiring a complete rewrite of the core order and inventory domains.

---

## 4. User Roles and Permissions

### 4.1 Founder

All co-founders should have access to the business information required for shared management.

Capabilities:

- View business dashboards and financial reports
- Manage products, recipes, and prices
- Record purchases, expenses, and founder contributions
- Receive inventory and perform authorized adjustments
- Process orders and payments
- Review audit logs
- Review cash reconciliation
- Participate in configured approval workflows

Sensitive actions must be protected by explicit permissions, audit records, and approval policies where appropriate.

### 4.2 Cashier or staff

The MVP may initially operate without separate cashier accounts beyond the founders. Staff roles must nevertheless be supported.

Capabilities:

- Create and process orders
- Record payment methods
- View authorized order history
- Open and close assigned cashier shifts
- View relevant POS synchronization status

Restrictions:

- Cannot manage founder contributions
- Cannot change system roles
- Cannot access restricted profit or expense reports
- Cannot perform unauthorized stock adjustments
- Cannot approve their own restricted refunds or sensitive actions

### 4.3 Authorization requirements

- Authentication must be required for protected business functions.
- Permissions must be enforced server-side and through database security policies.
- Hiding a button in the frontend must not be treated as authorization.
- All business records must be scoped to the correct shop.
- Account recovery must prevent accidental loss of access by all founders.
- Offline permissions must follow a documented device and session policy.

---

## 5. Functional Requirements

### FR-01: Business Setup

The system shall allow authorized founders to configure:

- Business name and profile
- Currency (PHP)
- Business timezone
- Receipt settings
- Business operating hours
- Registered POS device
- Minimum stock thresholds
- Discount and refund policies

The initial business state shall be pre-opening, with no fabricated transactions.

### FR-02: Product and Menu Management

The system shall allow founders to:

- Create and edit product categories.
- Create menu products and variants.
- Define sizes, add-ons, and selling prices.
- Enable or disable products.
- Set product availability.
- Associate each sellable variant with a recipe.
- Preserve historical transaction prices when menu prices change.

Example categories may include espresso-based drinks, non-coffee beverages, and other menu items.

### FR-03: Recipe and Cost Management

The system shall allow founders to define recipes for individual product variants.

Each recipe shall contain:

- Ingredient references
- Ingredient quantities
- Standardized units
- Recipe version
- Effective date or version activation
- Optional preparation or waste allowance

The system shall calculate estimated cost per serving using configured ingredient costs.

Recipe costs must not be presented as actual costs when ingredient prices are only estimates.

Historical transactions must retain the recipe and cost information applicable at the time of sale.

### FR-04: Supplier and Purchase Management

The system shall support:

- Supplier profiles and contact details
- Purchase records
- Purchase item quantities and costs
- Purchase status
- Receiving and partial receiving, if supported
- Purchase references and receipt attachments
- Actual purchase cost history

Planned purchases and quotations must not increase inventory.

Inventory shall increase only when an actual purchase is received or an authorized opening-stock entry is recorded.

### FR-05: Ingredient Inventory

The system shall track ingredients using consistent base units, including:

- Grams for ingredients such as coffee beans
- Milliliters for liquids
- Pieces for packaging and countable supplies

The system shall record stock movements for:

- Opening inventory
- Purchase receipts
- Recipe-based consumption
- Wastage and spoilage
- Physical stock adjustments
- Returns and approved corrections

The system shall provide:

- Current recorded stock
- Minimum stock levels
- Low-stock indicators
- Stock movement history
- Inventory valuation
- Physical stock count workflow

Stock corrections must create auditable movements rather than silently overwrite historical records.

The MVP must not claim that recorded stock always equals actual physical stock. Periodic counts are required to identify discrepancies.

### FR-06: Internal Point of Sale

The POS shall support authorized founders and staff processing:

- Dine-in orders
- Takeout orders
- Product selection and variants
- Add-ons and quantities
- Discounts according to permissions
- Checkout
- Payment recording
- Receipt generation
- Order history
- Approved cancellations and refunds

Each order shall have a unique identifier and a clear status.

The POS shall not expose public customer ordering in the MVP.

### FR-07: Payment Management

The system shall support manual recording of:

- Cash
- GCash
- Other configured e-wallets
- Other manually configured payment methods

Payment records shall contain the method, amount, status, reference when available, and associated order.

The system must distinguish recorded payment methods from confirmed payments.

An e-wallet method selected during checkout does not independently prove that funds were received.

The MVP shall not process actual online payments through a payment gateway.

### FR-08: Offline POS and Synchronization

The POS shall support one designated offline-capable device.

The application shall:

1. Cache the application shell and required menu data.
2. Persist offline orders in local storage.
3. Generate unique client-side order identifiers.
4. Retain queued transactions across browser refreshes and temporary outages.
5. Display pending and failed synchronization states.
6. Submit queued transactions when connectivity returns.
7. Retry failed synchronization safely.
8. Prevent duplicate order creation and stock deductions.
9. Mark transactions synchronized only after server confirmation.
10. Preserve sufficient diagnostic information for troubleshooting.

Server processing shall validate each queued transaction and atomically record the order, payment records, and associated stock movements.

The browser must not be trusted to calculate authoritative inventory balances or authorize sensitive actions.

Offline transactions shall be distinguishable from server-confirmed transactions.

The system shall document what happens when the local device is lost, browser storage is cleared, a session expires, or cached menu data becomes stale.

### FR-09: Founder Contributions and Startup Budget

The system shall allow authorized founders to record funding events with:

- Founder identity
- Amount
- Date
- Funding classification
- Payment method
- Reference
- Supporting documents
- Approval status, where applicable

Funding classifications shall distinguish capital contributions, founder loans, and reimbursable payments.

The system shall support:

- Planned startup budget
- Actual startup spending
- Founder contribution totals
- Purchase and expense references
- Reimbursement tracking, if implemented
- Funding history by founder

Founder contributions shall not be counted as sales revenue.

The system shall not automatically infer legal ownership percentages or profit-sharing entitlements from contribution amounts.

### FR-10: Expense Management

The system shall allow authorized users to record actual business expenses with:

- Category
- Amount
- Date incurred
- Payment method
- Person who paid
- Description
- Supporting receipt
- Approval status, where applicable

The system shall support planned budgets separately from actual expenses.

Equipment and other potentially capitalizable purchases shall not automatically be treated as ordinary operating expenses without an appropriate accounting classification.

### FR-11: Cashier Shifts and Reconciliation

The system shall support:

- Opening cash
- Closing cash
- Cash-in and cash-out records
- Expected cash calculation
- Actual counted cash
- Cash discrepancy
- Payment method reconciliation
- Shift history

The expected cash calculation must account for opening cash, cash sales, refunds, approved cash movements, and cash paid out.

E-wallet balances must be reconciled separately from physical cash.

The system shall not require a cashier salary or payroll module for the MVP.

### FR-12: Dashboard and Reporting

Before opening, the dashboard shall display:

- Pre-opening status
- Planned startup budget
- Actual recorded startup spending
- Menu and recipe setup progress
- Inventory setup status
- Founder funding summary

After operations begin, the dashboard shall display:

- Gross sales
- Discounts and refunds
- Net sales
- Completed orders
- Cost of goods sold
- Gross profit
- Estimated operating profit
- Sales by payment method
- Best-selling products
- Product profitability
- Low-stock ingredients
- Stock adjustments and wastage
- Founder contributions
- Cash reconciliation status
- Synchronization status

Reports shall distinguish zero values, missing data, insufficient history, estimates, and incomplete synchronization.

The system shall not invent trends or label products as poor performers solely because no sales have been recorded.

### FR-13: Audit Trail

The system shall log sensitive actions, including:

- Price changes
- Recipe changes
- Refunds and cancellations
- Inventory adjustments
- Expense edits
- Founder contribution changes
- Permission changes
- Approval decisions
- Sensitive synchronization errors

Audit records shall identify the actor, action, entity, timestamp, and relevant context.

Completed transactions must not be silently deleted to correct errors.

---

## 6. Financial Rules and Calculations

The system shall use explicit, documented financial definitions.

**Net sales**

Net sales = gross sales − discounts − refunds attributable to the reporting period.

**Cost of goods sold**

COGS represents the cost of ingredients and supplies consumed by products sold, according to the configured costing method.

**Gross profit**

Gross profit = net sales − COGS.

**Gross margin**

Gross margin = gross profit ÷ net sales × 100, when net sales are greater than zero.

**Estimated operating profit**

Estimated operating profit = gross profit − applicable operating expenses not already included in COGS.

The MVP shall label the result as an estimate when accounting adjustments or expenses are incomplete.

**Cash reconciliation**

Expected closing cash = opening cash + cash received − cash refunds − cash paid out + other approved cash movements.

Actual cash counted shall be compared with expected closing cash.

**Inventory costing**

The MVP shall establish a consistent costing policy. FIFO is a candidate for ingredient batch tracking, but the exact costing and accounting policy must be confirmed before production reporting is treated as authoritative.

The system shall not double-count purchases as expenses when the same inventory costs are later recognized through COGS.

All financial calculations shall use fixed-precision monetary storage or integer centavos consistently.

---

## 7. Technical Architecture

### 7.1 Recommended stack

- Frontend: Next.js App Router and TypeScript
- UI: Tailwind CSS and shadcn/ui
- PWA: Web App Manifest and service worker
- Local persistence: IndexedDB with Dexie
- Authentication: Supabase Auth
- Central database: Supabase PostgreSQL
- Authorization: Row Level Security and server-side checks
- Transaction processing: PostgreSQL functions/RPC and transactional operations
- Validation: Zod
- Charts: Recharts
- Testing: Vitest and Playwright
- Hosting: Vercel or another compatible platform

### 7.2 Architectural principles

- PostgreSQL is the authoritative source for synchronized business records.
- IndexedDB stores local working data and pending transactions.
- Offline order creation must not depend on a successful network request.
- Server transaction processing must be atomic and idempotent.
- Client-generated identifiers must be supported by appropriate database uniqueness constraints.
- Sensitive credentials must never be exposed in browser code.
- The application must not assume that a deployed web application is automatically offline-capable.
- The service worker must cache the application shell and required static assets.
- The initial release shall support one designated offline POS device.

### 7.3 Offline limitations

Offline synchronization is not equivalent to multi-device distributed inventory management.

The MVP shall not promise conflict-free stock control across multiple disconnected POS devices.

Changes to prices and recipes made elsewhere while the POS is disconnected must be reconciled through a defined configuration-version policy.

Device loss and browser storage loss are recognized risks. The product shall document recovery procedures and use server synchronization as soon as connectivity permits.

---

## 8. Database Design

The following entities represent the initial logical schema. Exact column definitions and relationships shall be specified in database migrations.

| Table | Purpose |
|---|---|
| `shops` | Business configuration |
| `profiles` | User identities |
| `shop_members` | Business membership and roles |
| `pos_devices` | Registered devices |
| `categories` | Product categories |
| `products` | Sellable products |
| `product_variants` | Sizes and product variants |
| `ingredients` | Ingredient catalog |
| `recipes` | Versioned product recipes |
| `recipe_items` | Ingredient quantities per recipe |
| `suppliers` | Supplier information |
| `purchases` | Supplier purchase records |
| `purchase_items` | Purchase line items |
| `orders` | Order header |
| `order_items` | Products sold |
| `payments` | Payment records |
| `stock_movements` | Ingredient stock ledger |
| `expenses` | Business expenses |
| `founder_contributions` | Founder funding |
| `cashier_shifts` | Cashier reconciliation |
| `audit_logs` | Sensitive activity history |
| `sync_operations` | Idempotent synchronization tracking |

Additional tables may include expense categories, approval requests, reimbursements, inventory batches, and business assets.

### Data integrity requirements

- Use UUIDs for primary identifiers where appropriate.
- Add foreign keys and unique constraints.
- Scope business data using `shop_id`.
- Use consistent units of measure.
- Store timestamps in UTC and display them in the shop timezone.
- Preserve transaction price and cost snapshots.
- Preserve recipe versions used for historical sales.
- Use append-only stock movements for inventory history.
- Enforce database authorization and shop isolation.
- Keep local sync state separate from authoritative business records.

---

## 9. User Experience Requirements

The interface shall prioritize speed, clarity, and ease of use during busy operating periods.

### Main navigation

1. Dashboard
2. POS
3. Orders
4. Products and menu
5. Recipes and costing
6. Inventory
7. Purchases and suppliers
8. Expenses
9. Founder contributions
10. Reports
11. Cashier shifts
12. Staff and permissions
13. Settings

Navigation items shall be displayed according to user permissions.

### Design principles

- Responsive desktop and tablet layouts
- Touch-friendly POS controls
- Fast product selection and checkout
- Clear order and payment statuses
- Visible online/offline status
- Visible pending synchronization count
- Clear distinction between planned, estimated, and actual figures
- Confirmation for destructive or sensitive actions
- Consistent empty states for pre-opening operations
- Accessible labels, keyboard navigation, and readable contrast

---

## 10. Non-Functional Requirements

### Reliability

- Orders must survive browser refreshes and temporary network outages once locally committed.
- Synchronization retries must not duplicate transactions.
- Stock movements and order processing must be atomic on the server.
- Failed operations must provide recoverable error states.

### Security

- Enforce authorization on the server and database.
- Use Row Level Security for business records.
- Do not expose service-role credentials to the browser.
- Avoid storing passwords and payment credentials locally.
- Audit sensitive financial and inventory actions.
- Define session expiry and offline-device access rules.

### Performance

- The POS shall prioritize fast local product search and cart interaction.
- Local checkout must not wait for network connectivity.
- Large reports must not block the primary POS workflow.
- Performance targets shall be verified on the actual POS hardware before launch.

### Data protection

- Provide a documented backup and restoration procedure.
- Test restoration before production launch.
- Define how locally queued orders are recovered after device failure.
- Minimize the personal data stored in the system.
- Keep demo and production data separate.

---

## 11. Implementation Roadmap

### Phase 1: Foundation

- Initialize repository and project conventions.
- Configure authentication and business membership.
- Create database migrations and authorization policies.
- Implement business setup and the pre-opening dashboard.
- Create founder accounts and role management.

**Deliverable:** secured application foundation.

### Phase 2: Menu and startup finance

- Implement categories, products, variants, and pricing.
- Implement recipes and estimated costing.
- Implement suppliers and planned purchases.
- Implement startup budget and founder contributions.
- Implement expense categories and actual expense records.

**Deliverable:** pre-opening business preparation system.

### Phase 3: POS and payments

- Implement cart and checkout.
- Implement dine-in and takeout workflows.
- Implement order history and receipts.
- Implement cash and e-wallet payment records.
- Implement controlled cancellations and refunds.

**Deliverable:** working internal POS.

### Phase 4: Inventory

- Implement purchase receiving.
- Implement opening-stock entry.
- Implement recipe-based ingredient consumption.
- Implement stock adjustments and wastage.
- Implement stock counts and low-stock alerts.

**Deliverable:** inventory-linked POS.

### Phase 5: Offline operation

- Implement the PWA service worker.
- Implement IndexedDB persistence.
- Implement unique local order IDs and synchronization queue.
- Implement server-side idempotency and transaction processing.
- Implement sync status, retry handling, and conflict resolution.
- Test offline checkout, refresh, reconnect, and device recovery.

**Deliverable:** verified offline-capable POS.

### Phase 6: Reporting and launch

- Implement sales and profitability reports.
- Implement expense and cash reconciliation.
- Implement audit views and data exports.
- Validate calculations against known test transactions.
- Test permissions, backups, and restoration.
- Remove demo data and prepare the production environment.

**Deliverable:** MVP ready for controlled business use.

---

## 12. Acceptance Criteria

The MVP shall not be considered ready until:

1. Founders can access business information according to their permissions.
2. Planned purchases do not increase actual stock.
3. Menu items and recipes can be configured before opening.
4. Staff can create dine-in and takeout orders.
5. Orders survive offline checkout and browser refresh.
6. Repeated synchronization does not duplicate orders or stock movements.
7. Purchase receiving and stock adjustments update the ingredient ledger correctly.
8. Recipe consumption is consistent with sold quantities and recipe versions.
9. Payment records distinguish recorded, pending, confirmed, and refunded amounts where applicable.
10. Founder funding is separate from sales revenue.
11. Expenses and cash movements are auditable.
12. Sales and profit calculations reconcile against test transactions.
13. Reports distinguish estimates, missing data, and pending synchronization.
14. Sensitive actions require the correct permissions.
15. Backup restoration and device recovery procedures have been tested.

---

## 13. Success Metrics

Because the business has not opened, actual sales and profitability targets cannot yet be established.

Initial success shall be measured by operational readiness:

- All required products and recipes can be configured.
- All founders can access the correct reports.
- A complete test order can be processed and synchronized.
- Inventory deductions match test recipes.
- Financial reports reconcile against known test data.
- No duplicate orders or stock deductions occur during retry tests.
- Production backup restoration succeeds.
- The system can operate through a simulated internet outage.

After opening, establish baselines for sales, average order value, product margins, inventory variance, wastage, and transaction processing time.

The system shall collect real data before generating historical trends or performance-based recommendations.

---

## 14. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Duplicate offline transactions | Idempotency keys and database uniqueness constraints |
| Inventory discrepancies | Stock movement ledger, physical counts, and audit logs |
| Stale offline prices | Versioned menu configuration and reconciliation rules |
| Device loss | Documented recovery process and server synchronization |
| Misleading profit reports | Explicit financial definitions and cost snapshots |
| Unauthorized founder or staff actions | Server-side authorization and database policies |
| Confusion between funding and revenue | Separate founder contribution records |
| Scope expansion | Defer public ordering, AI, and multi-branch features |
| Incorrect expense classification | Configurable categories and documented accounting rules |
| Overreliance on offline mode | One designated POS device in the initial release |

---

## 15. Future Roadmap

Following a stable MVP launch, potential enhancements include:

- Public customer ordering
- Customer accounts and loyalty
- Payment gateway integration
- Multi-branch inventory
- Advanced batch and expiry tracking
- Product demand forecasting
- AI-assisted business reporting
- Supplier reorder recommendations
- More detailed accounting integrations

Future features shall be prioritized using actual operating data and founder feedback.

---

## 16. Final Product Decision

NO BUSINENESS NAME FOR NOW shall launch as a single-branch, founder-managed, offline-capable PWA with internal POS, recipe-based ingredient inventory, founder funding records, expense tracking, and financial reporting.

The application shall support pre-opening preparation before any ingredients, equipment, or sales exist. It shall transition into daily operations through actual purchases, opening-stock records, and real transactions.

**The core principle is to record real business activity accurately from day one, without confusing estimates, planned purchases, founder funding, inventory, and revenue.**

This PRD is the baseline for implementation. Detailed database migrations, UI specifications, API contracts, and test cases should be derived from it during development.