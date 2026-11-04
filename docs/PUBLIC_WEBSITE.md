# LOGO Coffee public storefront

## Routes and design

- `/`: editorial hero, available featured products, concise brand story, illustrative coffee gallery, visit details, and final menu/visit calls to action.
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

The homepage chooses up to six available products alphabetically. Optional SITE_FEATURED_PRODUCT_IDS is a comma-separated list of existing product UUIDs to prioritize; unavailable products are still excluded. No best-seller claim is made. The catalog is read dynamically without an application cache, and the public menu refreshes on focus/visibility and retry. Stale content is retained with explicit feedback if a refresh fails; aborted requests cannot replace newer results. Current menu changes apply on the next page read or refresh.

## Photography and images

The official logo is served unchanged. Two real-camera Unsplash photographs are stored locally as WebP and explicitly labeled illustrative, not as LOGO Coffee products or premises. Replace them with owner-provided images using the central config. Source and licensing records are in `public/site/CREDITS.md`. Stock images are never assigned as substitutes for actual catalog product photos.

Next Image reserves image dimensions, preloads the actual hero, provides responsive sizes, and lazy-loads below-fold photography. The local hero is about 53 KB; the second source asset is about 168 KB before responsive optimization. Product image failures use a branded placeholder. Only configured Supabase storage hosts are permitted for remote optimization; other approved HTTPS product URLs are browser-loaded without opening a global server-side image proxy.

## SEO

Set SITE_URL to the verified HTTPS public origin **before building for production**. This enables canonical URLs, Open Graph/Twitter photo URLs, and the three-page sitemap. Without a confirmed domain, canonical URLs and sitemap entries are intentionally omitted rather than publishing localhost or a fictional domain. Page titles/descriptions, semantic menu content, descriptive alt text, and CafeOrCoffeeShop structured data are present. Structured data contains only supplied facts; operating days, coordinates, reviews, and unknown contacts remain unset. Robots and X-Robots-Tag exclude internal/account/API routes from indexing; authentication remains the actual security boundary.

## Validation approach

Public data projection, missing configuration, configured shop scoping, nested-cost exclusion, malformed data, visit details, and metadata have unit coverage. Browser tests cover six requested viewports, real photo loading, public/category navigation, size prices, stale/failed refreshes, keyboard focus, reduced motion, production image optimization, read-only APIs, and unauthenticated private access. Existing POS/CRUD/reporting regression suites remain applicable. No live checkout, product mutation, or business record was created to test the storefront.
