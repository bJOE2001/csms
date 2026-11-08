# Sip & Snap public storefront

## Routes and design

- `/`: five sections: takeaway-cup hero, four available featured products, concise brand story, verified visit details, and final menu/visit calls to action. The duplicate inspiration gallery and location ribbon are removed.
- `/menu`: the full public catalog with category filters, descriptions, currently available sizes, and PHP prices.
- `/visit`: owner-confirmed address, hours, and directions.
- `/#our-story`: proposed brand copy without invented business history. No separate About page is created without confirmed history.

Staff Menu Management is now `/app/menu`; the workspace sidebar and drawer link there. Update staff bookmarks that previously used `/menu`, which now belongs to the public catalog. `/coffee-menu` permanently redirects (308) to `/menu`, preserving query strings and product anchors. Dashboard, POS, Sales, Expenses, Libraries and account routes are unchanged. `/app` keeps its existing redirect. Public navigation and footer use PublicShell, SiteHeader, and the unchanged transparent official logo. There is no public cart or checkout. An Order Now link appears only when an approved HTTPS external ordering URL is configured.

Deploy both route moves, navigation links and redirect configuration together. `/menu` is indexable; `/app/menu` inherits the existing private `/app` headers and uses the unchanged authenticated product API. Sitemap, canonical metadata and structured-data menu URLs use `/menu`. This is a route-only transition: no product data, database schema, API contract or image reference changes. A rollback must restore the two prior route owners, their links and SEO rules together and remove the redirect. Permanent redirects can remain cached in clients, so do not reuse `/coffee-menu` for unrelated content.

The storefront uses the shared Warm Espresso & Caramel color tokens, Manrope body text, and a system Georgia editorial heading stack. No additional font download is required. Layouts adapt to desktop, tablet, and phone widths. The mobile Radix navigation drawer traps focus, supports Escape and outside dismissal, and restores focus. All essential content remains readable without animation. The abandoned scroll/CGI sequence and its unused GSAP dependency were removed.

The desktop header and mobile drawer each provide one Menu navigation link, without a duplicate View Menu button. The unconfigured mobile header contains the logo and right-aligned hamburger only; the optional approved external Order Now action is preserved. The hero and section-level menu calls to action remain available.

## Confirmed information and content

The owner supplied:

- Address: Purok 6, Ising, Carmen, Davao del Norte.
- Opening hours: 5:00 PM–9:00 PM.

The owner also supplied the shop's Google Maps link: https://maps.app.goo.gl/JFPkDck15BBvFdLe9. Directions on the homepage, Visit page and structured data use this exact link by default, centralized in `src/lib/brand.ts`; SITE_DIRECTIONS_URL remains an optional HTTPS override. Operating days, special schedules, contact number, email, social accounts, ordering channel, and real drink/café photography were not supplied. The site does not assume daily opening, calculate Open Now, invent contacts, or display testimonials.

Edit `src/lib/site/config.ts` for hero copy, brand description, photo paths, and owner-confirmed defaults. The same config supplies visit/footer content. Optional environment settings are listed in `.env.example`. Set SITE_ADDRESS and SITE_OPENING_HOURS only to verified replacements. Rebuild after production configuration changes.

## Publish the live menu

The existing Supabase catalog remains the only product dataset. There is no automatic demo-data fallback. Seeded database products are ordinary records: if available in an explicitly published shop, they also appear publicly under their stored names.

Apply the database expansion before deploying the new reader:

1. Run `supabase/migrations/202611060001_public_menu.sql` through the existing migration workflow or Supabase SQL Editor. It adds an owner-controlled publication flag defaulting to false; it does not publish, remove or replace existing records.
2. Run `supabase/publication/publish-public-menu.sql` to explicitly enable the intended shop. It selects a shop automatically only when exactly one exists. With multiple shops, set the existing shop UUID in the commented line first; ambiguous selection fails without changes.
3. Keep the existing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY configuration. The public-key variable accepts a modern Supabase publishable key or the existing legacy anon key. No credential rotation or change to private authentication is required. Complete SUPABASE_URL/SUPABASE_ANON_KEY runtime overrides also remain compatible.
4. Leave PUBLIC_MENU_SHOP_ID unset when exactly one shop is published. If multiple shops are published, set it to the intended existing published shop UUID. Unknown, disabled or ambiguous shops return an unpublished response.
5. Restart development or rebuild/redeploy production after configuration changes. Check `/api/public-menu`: a published shop returns actual available products; the endpoint stays read-only.

Keep the new `coffee_catalog_private` schema outside Supabase's exposed schemas. The public SECURITY INVOKER RPC calls a fixed read-only implementation there, with an empty search path and an explicit customer-field projection. Only the RPC execution rights are granted to anon/authenticated. Base-table anonymous grants and all existing private-table RLS policies stay unchanged. Owners retain the existing founder-only shop-update permission; staff and visitors cannot enable publication. This boundary follows Supabase's guidance for [database functions](https://supabase.com/docs/guides/database/functions) and [private security-definer helpers](https://supabase.com/docs/guides/database/postgres/row-level-security).

`readPublicMenu` creates a server-only client with the existing public key and no staff cookies, then calls `read_public_menu`. It never reads private tables or uses SUPABASE_SERVICE_ROLE_KEY. Publication is checked inside the database, including for direct RPC requests with another shop UUID. Active, non-archived products, active sizes, starting prices and original size ordering preserve the existing catalog rules. Product costs, nested size costs, size IDs, member IDs, notes, sales and administrative flags never leave the database through this RPC. Zod validates the returned public contract and browser API responses. Private local image routes and cross-shop category names are excluded. `/api/public-menu` is read-only; unsupported writes return 405. Existing `/api/pos` authorization is unchanged.

No public credentials or an invalid shop selection produce an unpublished state. Missing database functions, query failures or malformed responses produce a retryable unavailable state rather than falling back to elevated access. Apply SQL before the application deployment to avoid this intermediate state. Old app versions remain compatible with the additive migration during rollout, but keep their existing environment settings until that version is retired.

To unpublish on the new reader, set `public.shops.public_menu_enabled=false` for the intended shop. Keep PUBLIC_MENU_SHOP_ID configured on multi-shop website deployments so the site remains pinned to that shop. No product or transaction is deleted. If rolling the application back to the legacy reader, disable its PUBLIC_MENU_SHOP_ID configuration too: the old implementation does not check the new database flag. The additive column and RPC can remain without changing private workflows. Do not drop publication state or revoke unrelated project credentials as an implicit cleanup step.

The homepage chooses up to four available products alphabetically and displays actual prices, descriptions and active size labels. Optional SITE_FEATURED_PRODUCT_IDS is a comma-separated list of existing product UUIDs to prioritize; unavailable products are still excluded. No best-seller claim is made. The catalog is read dynamically without an application cache, and the public menu refreshes on focus/visibility and retry. Stale content is retained with explicit feedback if a refresh fails; aborted requests cannot replace newer results. Current menu changes apply on the next page read or refresh.

## Photography and images

The official business name is Sip & Snap. Public copy, accessible names, page metadata and structured data use that name. The exact full-color square `/images/Logo.png` is used unchanged; shared BrandLogo accepts a public alt label without changing private workspace usage. Social sharing uses the same official artwork rather than a concept photograph presented as an actual product.

Two generated, unbranded takeaway-cup concepts replace the glass-cup photographs. SitePhoto positions the exact original PNG as a separate, aspect-preserving sticker layer on the nearly front-facing cup surface. The generator never receives or redraws the wordmark. Visible captions and config mark both images as concepts; cup material, lids, packaging and premises are not verified business claims. `docs/PUBLIC_PHOTOGRAPHY.md` records prompts, assets and replacement instructions. Retired stock licensing records remain in `public/site/CREDITS.md`.

Only the hero photo is prioritized. Other photos are lazy-loaded. Both use next/image with explicit source dimensions and responsive sizes; they are never cropped to obscure cups or stickers. The two local WebP concepts total approximately 217 KB before responsive optimization. Actual product images take precedence; missing or broken images show an honest photo-coming-soon placeholder rather than a guessed drink. Only configured Supabase storage hosts are permitted for remote optimization; other approved HTTPS product URLs are browser-loaded without opening a global server-side image proxy. No new client animation, font download or dependency is introduced.

## Public product presentation

Featured products and the public menu share `PublicProductCard` and `PublicProductImage`. Both use reserved 4:3 frames with `object-fit: contain`, preserving the entire stored image without cropping or changing any asset. Loading and error states retain the frame dimensions. The existing public image references, optimization allowlist and upload compatibility remain intact; no new photography is generated or substituted by this refinement.

The existing 1280px content boundary is shared by navigation, sections and footer. At 1200px and above, featured products use four columns and the menu uses three; both use two columns from 640px to 1199px and one below 640px. Scoped spacing tokens keep product information compact. The menu heading is smaller, category controls use actual catalog categories, and the matching selection count sits in the browsing toolbar. Mobile category controls scroll within their own row and reserve room for keyboard focus outlines.

Cards show the existing category, PHP price, description and every available size with its recorded price. Differing size prices retain the existing “From” price; single-price products show an exact amount. Card descriptions use a three-line preview. Homepage detail links retain the public-menu product anchors; menu detail actions open the existing accessible dialog shell with the complete, unchanged description and size prices. The dialog remains read-only, supports keyboard focus, Escape and outside dismissal, and restores focus to its action. Long mobile details stack without overlapping the image or metadata. There is no customer cart, new route, database field or API change.

## SEO

Set SITE_URL to the verified HTTPS public origin **before building for production**. This enables canonical URLs, Open Graph/Twitter image URLs, and the three-page sitemap. Without a confirmed domain, canonical URLs and sitemap entries are intentionally omitted rather than publishing localhost or a fictional domain. Page titles/descriptions, semantic menu content, descriptive alt text, and CafeOrCoffeeShop structured data are present. Structured data contains only supplied facts; operating days, coordinates, reviews, and unknown contacts remain unset. Robots and X-Robots-Tag exclude internal/account/API routes from indexing; authentication remains the actual security boundary.

## Validation approach

Public data projection, missing configuration, configured shop scoping, nested-cost exclusion, malformed data, visit details, and metadata have unit coverage. Browser tests cover six requested viewports, real photo loading, public/category navigation, size prices, stale/failed refreshes, keyboard focus, reduced motion, production image optimization, read-only APIs, and unauthenticated private access. Existing POS/CRUD/reporting regression suites remain applicable. No live checkout, product mutation, or business record was created to test the storefront.

### Menu route migration validation — November 6, 2026

All 113 unit tests in 18 files, lint, TypeScript and the production build passed. The first standalone TypeScript run found stale generated Next.js references to the moved files; rebuilding regenerated them and the subsequent check passed. All 18 public-layout/workspace-navigation fixture tests passed across desktop, tablet and phone widths. Nine production browser checks passed: public routes and private API boundaries, the 308 redirect with query/anchor preservation, menu/directions navigation, SEO rules, three persistent-loading scenarios, product creation synchronized with POS, and staff read-only access. CRUD checks intercepted the private API and did not write hosted records. The built public API returned 10 published products. Source comparison confirms the staff page and loading component moved unchanged; only the public page's canonical path changed.

### Public product refinement validation — November 6, 2026

All 113 unit tests, lint, TypeScript and the final production build passed. Twelve public UI tests passed, including layouts at 1440, 1280, 1032, 960, 768 and 393px. Final regression reruns also passed for complete descriptions, long titles and size labels, exact and starting prices, loading/error recovery, keyboard focus, mobile category scrolling and landscape layouts. Visual review identified and corrected a collapsed mobile dialog grid row; the regression now checks that metadata and copy remain below the image and visible. Geometry checks wait for web fonts before testing focus-outline clearance.

Five production-browser tests passed, covering navigation, redirects, private API protection, optimized product images, read-only dialog hydration and SEO. Desktop, tablet and phone screenshots were inspected. Existing photo assets, logo artwork, product references, public API contracts, database records and private workflows were not changed by this UI refinement. No new dependency was introduced. Owner-provided product photography can replace the existing references without changing the layout.

### Restricted-catalog migration validation — November 6, 2026

All 112 unit tests in 17 files, TypeScript and the production build passed. Lint completed with no errors and one pre-existing unused `coffeeBrand` import warning in `src/components/brand-logo.tsx`. Disposable PostgreSQL tests applied every migration and verified anonymous projection, nested-cost exclusion, active sizes and prices, private-table/write denial, founder/staff publication permissions, cross-shop isolation, unknown/ambiguous selection, unpublishing, setup retries and migration-state preservation. Existing POS, financial, expense, image-storage, legacy receipt and seed regressions also passed. No hosted financial or product record was changed. No new browser layout check was needed for this backend-only migration; the earlier storefront checks below remain historical results.

After the owner applied the hosted SQL, a read-only check using the existing public key returned `published` with 10 products and no private cost, shop, creator or default-size fields. Publication does not rename existing shop records; the targeted name correction is documented in `docs/BRANDING.md`.

### Redesign validation — November 6, 2026

- `npm run lint`, `npm run typecheck` and `npm run build` passed.
- All 99 unit tests in 15 files passed. All nine storefront browser tests passed at 1440, 1280, 1032, 960, 768 and 393px using isolated catalog fixtures.
- The production build was also inspected at 1440 × 900, 1280 × 800, 1032 × 1376, 768 × 1024 and 393 × 852. Public titles, five sections, image loading, overflow, menu/visit navigation and mobile drawer interactions passed. Source PNG proportions and its SHA-256 remain unchanged.
- Existing server reporting routes redirect anonymous users to sign-in. Existing client workspaces show a sign-in-required state without tables or mutation controls; `/api/pos` returns 401 without data. Public menu writes return 405. The Next Image endpoint returned a valid optimized hero image. No browser page errors were observed during the API/security checks.
- Representative text contrast pairs measure 4.66:1 or higher. Keyboard focus, drawer Escape/restore behavior, skip navigation and reduced motion were checked.

The redesign checks above predate the restricted-catalog migration. The local environment has public Supabase credentials but no hosted SQL administration connection or verified SITE_URL. Apply the new migration and explicitly publish the intended shop using the setup above before expecting live public products. Hosted database state has not been changed by the local implementation. Set the verified public origin for canonical/social URLs. Owner-approved product and shop photography, packaging, operating days and contact channels remain owner-supplied information. Generated photographs are temporary concepts.

### Components and files

- `src/components/site/public-landing.tsx`, `featured-products.tsx`, `public-product-card.tsx` and new `site-photo.tsx`: five-section content, actual featured records, sizes, image fallbacks and exact-artwork composition.
- `src/components/site/site-header.tsx`, `public-shell.tsx`, `visit-section.tsx` and `menu-gallery.tsx`: public navigation, footer, location content and consistent Sip & Snap naming.
- `src/app/landing.css`: scoped editorial layout, responsive grids, compact navigation, readable controls and motion preferences.
- `src/lib/site/config.ts`, `public-menu.ts`, `seo.ts`, public page files and root metadata: content, four-product selection, correct business name and social imagery. `src/components/brand-logo.tsx` adds an optional alt label while preserving its private-workspace default and original asset.
- `public/site/*-concept.webp`, photography/credits documentation and public unit/browser tests: optimized temporary images, provenance, replacement instructions and regression coverage. No database, private API, accounting or checkout code changed.
