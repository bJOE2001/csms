# LOGO public storefront

## Routes and design

- `/`: five sections: takeaway-cup hero, four available featured products, concise brand story, verified visit details, and final menu/visit calls to action. The duplicate inspiration gallery and location ribbon are removed.
- `/coffee-menu`: the full public catalog with category filters, descriptions, currently available sizes, and PHP prices.
- `/visit`: owner-confirmed address, hours, and directions.
- `/#our-story`: proposed brand copy without invented business history. No separate About page is created without confirmed history.

`/menu` remains Menu Management. Dashboard, POS, Sales, Expenses, Libraries, account routes, and existing bookmarks are unchanged. `/app` keeps its existing redirect. Public navigation and footer use PublicShell, SiteHeader, and the unchanged transparent official logo. There is no public cart or checkout. An Order Now link appears only when an approved HTTPS external ordering URL is configured.

The storefront uses the shared Warm Espresso & Caramel color tokens, Manrope body text, and a system Georgia editorial heading stack. No additional font download is required. Layouts adapt to desktop, tablet, and phone widths. The mobile Radix navigation drawer traps focus, supports Escape and outside dismissal, and restores focus. All essential content remains readable without animation. The abandoned scroll/CGI sequence and its unused GSAP dependency were removed.

## Confirmed information and content

The owner supplied:

- Address: Purok 6, Ising, Carmen, Davao del Norte.
- Opening hours: 5:00 PM–9:00 PM.

Operating days, special schedules, contact number, email, social accounts, exact map pin, ordering channel, and real drink/café photography were not supplied. The site does not assume daily opening, calculate Open Now, invent contacts, or display testimonials. Directions use a Google Maps search for the actual supplied address; SITE_DIRECTIONS_URL can replace this with the precise store pin.

Edit `src/lib/site/config.ts` for hero copy, brand description, photo paths, and owner-confirmed defaults. The same config supplies visit/footer content. Optional environment settings are listed in `.env.example`. Set SITE_ADDRESS and SITE_OPENING_HOURS only to verified replacements. Rebuild after production configuration changes.

## Publish the live menu

The existing Supabase catalog remains the only product dataset. No seed data or sample prices are shown to customers, including in development.

Set these **server-only** environment variables in the deployment configuration or private `.env.local`:

- PUBLIC_MENU_SHOP_ID: the existing shop UUID explicitly approved for public publication.
- SUPABASE_SERVICE_ROLE_KEY: the Supabase service-role credential. Never place this key in source control, customer JavaScript, chat, or a NEXT_PUBLIC_ variable.
- Use the existing NEXT_PUBLIC_SUPABASE_URL for the project URL. If a SUPABASE_URL runtime override is needed, also configure SUPABASE_ANON_KEY as required by the existing private-app environment contract.

Restart/rebuild the application after configuring publication. No database schema or RLS change is required. Missing configuration produces an honest unpublished-menu state. A database failure produces a retryable unavailable state instead of demo prices.

`readPublicMenu` creates a server-only client without staff cookies, scopes both reads to the configured shop, and projects explicit customer fields. Active, non-archived products and active sizes follow the existing isAvailable rule. Product costs, nested size costs, member IDs, notes, sales, and administrative flags never enter the public response or React props. Zod validates projected products and browser API responses. `/api/public-menu` is read-only; unsupported writes return 405. Existing `/api/pos` authorization is unchanged.

The homepage chooses up to four available products alphabetically and displays actual prices, descriptions and active size labels. Optional SITE_FEATURED_PRODUCT_IDS is a comma-separated list of existing product UUIDs to prioritize; unavailable products are still excluded. No best-seller claim is made. The catalog is read dynamically without an application cache, and the public menu refreshes on focus/visibility and retry. Stale content is retained with explicit feedback if a refresh fails; aborted requests cannot replace newer results. Current menu changes apply on the next page read or refresh.

## Photography and images

The official business name is LOGO. Public copy, accessible names, page metadata and structured data use that name. The exact black-and-white `/images/Logov1.png` remains unchanged; shared BrandLogo accepts a public alt label without changing private workspace usage. Social sharing uses the same official artwork rather than a concept photograph presented as an actual product.

Two generated, unbranded takeaway-cup concepts replace the glass-cup photographs. SitePhoto positions the exact original PNG as a separate, aspect-preserving sticker layer on the nearly front-facing cup surface. The generator never receives or redraws the wordmark. Visible captions and config mark both images as concepts; cup material, lids, packaging and premises are not verified business claims. `docs/PUBLIC_PHOTOGRAPHY.md` records prompts, assets and replacement instructions. Retired stock licensing records remain in `public/site/CREDITS.md`.

Only the hero photo is prioritized. Other photos are lazy-loaded. Both use next/image with explicit source dimensions and responsive sizes; they are never cropped to obscure cups or stickers. The two local WebP concepts total approximately 217 KB before responsive optimization. Actual product images take precedence; missing or broken images show an honest photo-coming-soon placeholder rather than a guessed drink. Only configured Supabase storage hosts are permitted for remote optimization; other approved HTTPS product URLs are browser-loaded without opening a global server-side image proxy. No new client animation, font download or dependency is introduced.

## SEO

Set SITE_URL to the verified HTTPS public origin **before building for production**. This enables canonical URLs, Open Graph/Twitter image URLs, and the three-page sitemap. Without a confirmed domain, canonical URLs and sitemap entries are intentionally omitted rather than publishing localhost or a fictional domain. Page titles/descriptions, semantic menu content, descriptive alt text, and CafeOrCoffeeShop structured data are present. Structured data contains only supplied facts; operating days, coordinates, reviews, and unknown contacts remain unset. Robots and X-Robots-Tag exclude internal/account/API routes from indexing; authentication remains the actual security boundary.

## Validation approach

Public data projection, missing configuration, configured shop scoping, nested-cost exclusion, malformed data, visit details, and metadata have unit coverage. Browser tests cover six requested viewports, real photo loading, public/category navigation, size prices, stale/failed refreshes, keyboard focus, reduced motion, production image optimization, read-only APIs, and unauthenticated private access. Existing POS/CRUD/reporting regression suites remain applicable. No live checkout, product mutation, or business record was created to test the storefront.

### Redesign validation — November 6, 2026

- `npm run lint`, `npm run typecheck` and `npm run build` passed.
- All 99 unit tests in 15 files passed. All nine storefront browser tests passed at 1440, 1280, 1032, 960, 768 and 393px using isolated catalog fixtures.
- The production build was also inspected at 1440 × 900, 1280 × 800, 1032 × 1376, 768 × 1024 and 393 × 852. Public titles, five sections, image loading, overflow, menu/visit navigation and mobile drawer interactions passed. Source PNG proportions and its SHA-256 remain unchanged.
- Existing server reporting routes redirect anonymous users to sign-in. Existing client workspaces show a sign-in-required state without tables or mutation controls; `/api/pos` returns 401 without data. Public menu writes return 405. The Next Image endpoint returned a valid optimized hero image. No browser page errors were observed during the API/security checks.
- Representative text contrast pairs measure 4.66:1 or higher. Keyboard focus, drawer Escape/restore behavior, skip navigation and reduced motion were checked.

The local environment has no public catalog publication settings or SITE_URL. Production correctly shows an unpublished-menu state; configured live products were not verified against the database. Use the existing publication setup above to display real catalog records, and set the verified public origin for canonical/social URLs. Owner-approved product and shop photography, packaging, operating days, contact channels and an exact map pin remain owner-supplied information. Generated photographs are temporary concepts.

### Components and files

- `src/components/site/public-landing.tsx`, `featured-products.tsx`, `public-product-card.tsx` and new `site-photo.tsx`: five-section content, actual featured records, sizes, image fallbacks and exact-artwork composition.
- `src/components/site/site-header.tsx`, `public-shell.tsx`, `visit-section.tsx` and `menu-gallery.tsx`: public navigation, footer, location content and consistent LOGO naming.
- `src/app/landing.css`: scoped editorial layout, responsive grids, compact navigation, readable controls and motion preferences.
- `src/lib/site/config.ts`, `public-menu.ts`, `seo.ts`, public page files and root metadata: content, four-product selection, correct business name and social imagery. `src/components/brand-logo.tsx` adds an optional alt label while preserving its private-workspace default and original asset.
- `public/site/*-concept.webp`, photography/credits documentation and public unit/browser tests: optimized temporary images, provenance, replacement instructions and regression coverage. No database, private API, accounting or checkout code changed.
