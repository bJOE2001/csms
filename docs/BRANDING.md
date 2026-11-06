# LOGO — Warm Espresso & Caramel

The application uses a dark Espresso navigation shell, a transparent logo treatment, a Warm Canvas workspace, white panels and Caramel highlights. Self-hosted Manrope, existing Lucide icons, compact POS cards, shared tables and pagination remain in place. This is a presentation refactor; transaction calculations, authentication, requests, database schemas and reporting scope are unchanged.

## Approved artwork

The official business name is **LOGO**, centralized in `src/lib/brand.ts`. Existing `shops.name` database values are not rewritten by visual branding or menu-publication changes. `supabase/branding/rename-logo-shop.sql` renames only the owner-identified shop to LOGO while retaining its UUID, publication flag and related records. Receipt headers still recognize the legacy Coffee Logo and LOGO Coffee aliases without printing a duplicate branch label.

The artwork file is `public/images/Logov1.png`, served at `/images/Logov1.png`. It is the supplied 1774 × 887 transparent RGBA PNG with a built-in cream-white outer stroke. Its SHA-256 is `5cd6b880112565461c5905d0e042ae0bb13ac1ba6faa12f12751858e13c43b25`. `BrandLogo` serves the original file directly, with explicit intrinsic dimensions, `alt="LOGO"`, automatic height and `object-fit: contain`. It applies no crop, filter, artificial stroke, image background, shadow or transform.

The shared `.brand-artwork` wrapper is fully transparent, with no padding, border, rounded backing or shadow. Desktop workspace branding renders at 128 × 64px, aligned with the navigation icons horizontally and the workspace header's top content boundary vertically. Compact headers and the navigation drawer render the logo at 104 × 52px. Public home, account and setup headers use the same transparent component directly on their existing Espresso topbars. The favicon references the same approved file. Shop names remain in account context and receipt/report data; the workspace brand link retains the current shop name in its accessible label and title.

## Color tokens

`src/app/tokens.css` is the source of styling colors. Primitive colors are HSL channels, preserving the existing Tailwind/shadcn alpha-aware contracts. Hex values are documented beside their definitions. Semantic variables reference the primitives, and legacy aliases such as `--paper`, `--ink`, `--brand` and `--focus` resolve to those same definitions.

| Primitive | Hex | Role |
| --- | --- | --- |
| `--espresso` | `#3B1B12` | Primary actions, sidebar, selected navigation text |
| `--roasted-coffee` | `#75442D` | Prices, supporting brand accents, control focus |
| `--caramel` | `#F2A15E` | Add actions, active navigation, added-to-cart status |
| `--latte-cream` | `#FFE4C6` | Selected size pills and options |
| `--warm-canvas` | `#FAF7F3` | Workspace background |
| `--pure-white` | `#FFFFFF` | Cards, inputs, tables and primary action text |
| `--warm-ivory` | `#FFF2E7` | Search surfaces, neutral hover states |
| `--soft-sand` | `#E8DED6` | Card borders and decorative separators |
| `--dark-cocoa` | `#2C211D` | Body text and headings |
| `--muted-mocha` | `#7E7068` | Approved muted brand color |
| `--warm-white` | `#FFF4E8` | Sidebar text |
| `--cream-taupe` | `#CDB8AA` | Sidebar icons |

Sidebar hover and separator tokens retain the approved `#553023` and `#5B382A`. The document's browser theme color in `layout.tsx` also uses Espresso. Existing error, success and warning colors are centralized separately; completed sales, available products and active expenses use green semantic badges rather than brand-colored financial statuses. Refunded, cancelled and voided labels retain their existing meanings.

## Controls and contrast

Primary/Save/checkout buttons use Espresso with white text. The shared `accent` button variant uses Caramel with Espresso text for Add product, Add category and Add Expense. Outlined buttons use white, Soft Sand and Warm Ivory hover. Destructive actions retain red styling. No handlers or validation rules change.

Two minimal variants support contrast across warm surfaces: `--readable-mocha` (`#7B6D65`) replaces muted foreground text, and `--control-sand` (`#A08878`) identifies editable control boundaries. The original approved colors remain available as primitives. Decorative Soft Sand borders do not identify form controls by themselves.

Measured sRGB contrast ratios:

| Pair | Ratio |
| --- | --- |
| White on Espresso | 15.54:1 |
| Espresso on Caramel | 7.43:1 |
| Warm White on Espresso | 14.32:1 |
| Cream Taupe on Espresso | 8.16:1 |
| Roasted Coffee on White | 8.01:1 |
| Readable Mocha on Warm Canvas | 4.66:1 |
| Readable Mocha on Warm Ivory | 4.53:1 |
| Control Sand on White | 3.34:1 |
| Control Sand on Warm Ivory | 3.04:1 |

Text controls keep one existing inset 2px focus indicator; composite search inputs delegate focus to their wrapper. Buttons use the existing visible outline without an additional shadcn shadow ring. Dark navigation uses a cream focus outline, with Espresso for an inset active-link outline. Disabled states retain native semantics, and icon controls retain tooltips and accessible labels. These targeted checks are not a complete accessibility certification.

## Adaptive shell

At 1280px and above, the 216px sidebar stays vertical with a compact logo, all five module links and Sign out at its bottom. Below 1280px, only the logo and hamburger trigger remain in the header. The five module links and unchanged POST Sign out action move into a left-side Espresso drawer using the existing Radix Dialog dependency. Desktop and drawer navigation share their route definitions and active-state rendering.

The modal drawer supports its close button, overlay and Escape, traps keyboard focus and restores focus to the trigger. Selecting a route closes it. Crossing into desktop layout closes it and focuses the active sidebar link because the compact trigger becomes hidden. Short screens scroll the drawer; reduced-motion preferences suppress its slide animation. Mobile management grids allocate spare height to content rather than stretching the header.

Below 1280px, POS keeps its full-width product menu and existing modal cart drawer. Independent product/cart scrolling, quantity controls, size choices, pending sales and Cash/E-wallet interactions remain unchanged. Management content keeps its existing scrolling behavior, with positioned workspace panes containing visually hidden accessibility labels. Financial summaries and CSVs use the full selected period, independent of visible table pages.

## Implementation map

| Area | Files |
| --- | --- |
| Logo and navigation | `src/components/brand-logo.tsx`, `src/components/workspace-header.tsx`, `src/app/workspace-shell.css` |
| Theme and shared controls | `src/app/tokens.css`, `src/app/globals.css`, `src/components/ui/button.tsx`, `src/components/ui/primitives/button.tsx` |
| Public/account identity | `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/app/setup/page.tsx`, `src/components/ui/account-shell.tsx` |
| Module surfaces and tables | `src/app/menu.css`, `src/app/sales.css`, `src/app/libraries.css`, `src/app/tables.css` |
| Add action treatments | `src/components/menu/product-dialog.tsx`, `src/components/libraries/category-dialog.tsx`, `src/components/expense-dialog.tsx` |
| Documentation and verification | `README.md`, `docs/UI_DESIGN.md`, `docs/BRANDING.md`, `tests/ui/branding.spec.ts`, `tests/ui/navigation.spec.ts` |

`public/images/Logov1.png` is the supplied asset, not a generated derivative. Existing Tailwind configuration, APIs, financial services and database migrations require no branding changes.
