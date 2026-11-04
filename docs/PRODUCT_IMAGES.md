# Product image uploads

Menu uses the existing `pos_products.image_url` field for both uploads and legacy HTTPS/local image URLs. No product-table migration, new image model or runtime writes to `public` are needed. Menu, POS and Cart already share `ProductThumbnail`, including the existing neutral fallback. Prices, sizes, cost snapshots and checkout behavior are unchanged.

## Storage setup

Run [`supabase/storage/product-images.sql`](../supabase/storage/product-images.sql) in the existing Supabase project's SQL Editor after the application migrations, before enabling uploads in the deployed frontend. This creates a public `product-images` bucket with a 5 MiB limit and JPEG/PNG/WebP allowlist, plus authenticated owner-only policies. The script is idempotent and refuses to silently change an incompatible existing bucket. Review any existing broad Storage policies when deploying; policies in PostgreSQL are permissive by default and can combine with this bucket's policies.

The same configured Supabase URL/public key and authenticated server cookies are used. No new provider, service-role secret or credentials in browser code are required. Product photographs are publicly readable through their generated URLs; uploads, listing and deletion require an active shop founder. Existing staff accounts keep their read/sell permissions.

The Node.js runtime needs Sharp, now declared directly at the version already used by Next.js. The reverse proxy/hosting request limit must allow at least 5 MiB plus 32 KiB of multipart overhead. Hosts with a lower function-body limit need an appropriate upload ingress before supporting the full 5 MiB allowance. Storage persists independently of the Next server's filesystem and instances.

## Save and validation

`ProductImageUpload` defaults to Upload Image and supports file selection, preview, replacement, removal and drag-and-drop. The optional Image URL mode preserves existing URL workflows. Switching to Image URL discards a pending local file and restores the current URL. No upload occurs until Save; cancelling or discarding a form creates no object. Object URLs are revoked when previews change or unmount. Pending saves disable image controls along with the rest of the existing form.

The existing `/api/pos` POST endpoint retains its JSON contract. A multipart product save adds a `payload` JSON field and an `image` file field. JSON requests remain bounded at 32 KiB; multipart bodies are bounded while streaming at 5 MiB plus 32 KiB, including when Content-Length is absent. The JSON payload is separately bounded at 32 KiB. Non-product multipart actions are rejected.

The server checks origin, authentication and active owner membership before storing an image. Product fields are validated before upload. Uploaded product drafts require their existing stable UUID, preserving product identity across retries. Content signatures restrict decoding to JPEG, PNG and WebP; Sharp then decodes the full image with strict error handling and a 20 megapixel bound. Empty, oversized, corrupt, SVG and animated files are rejected. Neither a filename nor a declared MIME type establishes trust. The original validated raster bytes are stored without cropping, resizing or recoloring, with the detected content type and a server-generated `shop UUID/product UUID/object UUID.extension` key. Existing objects are never overwritten.

The server saves the public URL through the existing atomic `pos_save_product` RPC. A failed upload never updates the product. A confirmed PostgreSQL rollback triggers best-effort removal of only that request's new object. Storage errors before the RPC also trigger cleanup in case the file arrived but the response was lost. Storage deletion policies independently refuse to delete an object referenced by any product, including archived records and references in another shop.

## Retention and recovery

Replaced or removed images and archived products' files are retained deliberately. Active carts or another record may still use their URLs; no automatic old-image deletion is introduced. Legacy externally hosted images are never deleted by this application.

Storage and PostgreSQL are separate transactions. A connection failure after a save may leave its outcome uncertain; that new object is retained rather than risk breaking a committed product image. Refresh Menu before retrying. A process crash or failed cleanup can also leave an unreferenced file. Reconcile retained objects through Supabase Storage with a retention period suitable for the business; check all product references, archived records, other shops and active-client usage before deletion. Do not delete Storage metadata directly with SQL: use the Storage API/Dashboard so the underlying object is removed too.

## Validation

Unit tests decode genuine JPEG/PNG/WebP files and check spoofing, corruption, size/pixel limits, authorization, origin checks, JSON compatibility, stable product IDs and failure cleanup. Browser tests use actual components with mocked API/Storage responses for selection, previews, URL editing, retries, removal, discard, drag-and-drop, pending states and Menu/POS/Cart rendering at desktop/tablet/mobile widths.

`python -B tests/database/check-simple-pos.py` tests all application migrations and the new Storage policies in a disposable PostgreSQL cluster. Its minimal Storage metadata fixture checks ownership, cross-shop isolation, unreferenced-file cleanup, archived/shared-image retention and repeatable setup. It does not emulate the Storage HTTP service or connect to the configured Supabase project. Verify a real owner upload and staff denial in the hosted environment after running the setup script.

Implementation references: [Supabase standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [Sharp decoder limits](https://sharp.pixelplumbing.com/api-constructor/).
